// supabase/functions/batch-curator/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'

const SUPABASE_URL = Deno.env.get('BASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('BASE_SERVICE_ROLE_KEY') || ''

// Define the interface for the detail object
interface ProcessingDetail {
  topicId: number;
  topic: string;
  subtopic: string;
  status: string;
  message: string;
}

// Define the results interface
interface ProcessingResults {
  total: number;
  processed: number;
  errors: number;
  details: ProcessingDetail[];
}

serve(async (req) => {
  try {
    // Handle authorization if needed
    // const apiKey = req.headers.get('x-api-key')
    // if (!apiKey || apiKey !== Deno.env.get('ADMIN_API_KEY')) {
    //   return new Response(
    //     JSON.stringify({ error: 'Unauthorized' }),
    //     { status: 401, headers: { 'Content-Type': 'application/json' } }
    //   )
    // }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Get all topics and subtopics from the database
    const { data: syllabusItems, error: fetchError } = await supabase
      .from('syllabus')
      .select('id, topic, subtopic')
      .limit(1)
    
    if (fetchError) {
      console.error('Error fetching syllabus data:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch syllabus data' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const results: ProcessingResults = {
      total: syllabusItems.length,
      processed: 0,
      errors: 0,
      details: []
    }
    
    // Process each topic/subtopic in sequence to avoid rate limiting
    for (const item of syllabusItems) {
      try {
        // Call the YouTube curator function for each topic/subtopic
        const curatorUrl = new URL('/functions/v1/youtube-curator', SUPABASE_URL).toString()
        const curatorResponse = await fetch(curatorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            topicId: item.id,
            topic: item.topic,
            subtopic: item.subtopic
          })
        })
        
        const curatorResult = await curatorResponse.json()
        
        results.details.push({
          topicId: item.id,
          topic: item.topic,
          subtopic: item.subtopic,
          status: curatorResponse.ok ? 'success' : 'error',
          message: curatorResult.message || curatorResult.error || ''
        })
        
        if (curatorResponse.ok) {
          results.processed++
        } else {
          results.errors++
        }
        
        // Add a delay to avoid hitting YouTube API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (itemError) {
        console.error(`Error processing item ${item.id}:`, itemError)
        results.errors++
        results.details.push({
          topicId: item.id,
          topic: item.topic,
          subtopic: item.subtopic,
          status: 'error',
          message: itemError instanceof Error ? itemError.message : 'Unknown error'
        })
      }
    }
    
    return new Response(
      JSON.stringify(results),
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