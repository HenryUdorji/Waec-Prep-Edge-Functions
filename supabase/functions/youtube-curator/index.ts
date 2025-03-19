// supabase/functions/youtube-curator/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'

// Configuration - you'll need to set these in your Supabase Dashboard
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('BASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('BASE_SERVICE_ROLE_KEY') || ''

interface VideoData {
  videoId: string
  channelName: string
  title: string
  description: string
  thumbnailUrl: string
  publishedAt: string
  topic: string
  subtopic: string
  topicId: number
}

serve(async (req) => {
  try {
    // Parse the request body
    const { topicId, topic, subtopic } = await req.json()
    
    if (!topic || !subtopic) {
      return new Response(
        JSON.stringify({ error: 'Topic and subtopic are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Perform YouTube search
    const videos = await searchYouTubeVideos(topic, subtopic)
    
    if (!videos || videos.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No videos found for the given topic and subtopic' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Insert videos into database
    const { data, error } = await supabase
      .from('curated_videos')
      .upsert(videos.map(video => ({
        video_id: video.videoId,
        channel_name: video.channelName,
        title: video.title,
        description: video.description,
        thumbnail_url: video.thumbnailUrl,
        published_at: video.publishedAt,
        topic: video.topic,
        subtopic: video.subtopic,
        topic_id: topicId
      })))
    
    if (error) {
      console.error('Error inserting videos:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to save videos to database' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    return new Response(
      JSON.stringify({ 
        message: `Successfully saved ${videos.length} videos for ${topic} - ${subtopic}`,
        count: videos.length 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Server error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

async function searchYouTubeVideos(topic: string, subtopic: string): Promise<VideoData[]> {
  try {
    // Craft search query
    const searchQuery = `mathematics ${topic} ${subtopic} tutorial`
    const maxResults = 5 // Limit to 5 videos per topic/subtopic
    
    // YouTube API v3 search endpoint
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&maxResults=${maxResults}&type=video&key=${YOUTUBE_API_KEY}`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`YouTube API error: ${response.status} ${errorText}`)
      throw new Error(`YouTube API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Extract relevant information and format for our database
    return data.items.map((item: any) => ({
      videoId: item.id.videoId,
      channelName: item.snippet.channelTitle,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnailUrl: item.snippet.thumbnails.default.url,
      publishedAt: item.snippet.publishedAt,
      topic: topic,
      subtopic: subtopic,
      topicId: 0 // This will be replaced by the passed value
    }))
    
  } catch (error) {
    console.error('Error fetching YouTube videos:', error)
    return []
  }
}