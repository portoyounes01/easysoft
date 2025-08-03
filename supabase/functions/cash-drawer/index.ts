// Cash Drawer Control Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface CashDrawerRequest {
  action: 'open' | 'close' | 'status' | 'test'
  employeeId: string
  transactionId?: string
  reason?: string
}

interface CashDrawerResponse {
  success: boolean
  message: string
  command?: number[]
  timestamp?: string
  logId?: string
}

// ESC/POS Commands for cash drawer
const CASH_DRAWER_COMMANDS = {
  // Standard cash drawer open command (most common)
  OPEN_DRAWER_1: [0x1B, 0x70, 0x00, 0x19, 0xFA], // ESC p 0 25 250
  // Alternative command for different drawer types
  OPEN_DRAWER_2: [0x1B, 0x70, 0x01, 0x19, 0xFA], // ESC p 1 25 250
  // Test pulse (shorter duration)
  TEST_PULSE: [0x1B, 0x70, 0x00, 0x0A, 0x7D], // ESC p 0 10 125
}

Deno.serve(async (req) => {
  // CORS headers for browser requests
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, message: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { action, employeeId, transactionId, reason }: CashDrawerRequest = await req.json()

    // Validate required fields
    if (!action || !employeeId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: action, employeeId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const timestamp = new Date().toISOString()
    let response: CashDrawerResponse

    switch (action) {
      case 'open':
        // Log the action in database
        const { data: logEntry, error: logError } = await supabase
          .from('cash_drawer_logs')
          .insert({
            employee_id: employeeId,
            transaction_id: transactionId,
            action: 'open',
            reason: reason || 'Manual open',
            timestamp: timestamp,
            success: true
          })
          .select()
          .single()

        if (logError) {
          console.error('Failed to log cash drawer action:', logError)
        }

        response = {
          success: true,
          message: 'Cash drawer open command generated',
          command: CASH_DRAWER_COMMANDS.OPEN_DRAWER_1,
          timestamp,
          logId: logEntry?.id
        }
        break

      case 'test':
        // Test command with shorter pulse
        const { data: testLog, error: testError } = await supabase
          .from('cash_drawer_logs')
          .insert({
            employee_id: employeeId,
            action: 'test',
            reason: 'Hardware test',
            timestamp: timestamp,
            success: true
          })
          .select()
          .single()

        if (testError) {
          console.error('Failed to log test action:', testError)
        }

        response = {
          success: true,
          message: 'Cash drawer test pulse generated',
          command: CASH_DRAWER_COMMANDS.TEST_PULSE,
          timestamp,
          logId: testLog?.id
        }
        break

      case 'status':
        // Get recent drawer activity
        const { data: recentLogs, error: statusError } = await supabase
          .from('cash_drawer_logs')
          .select('*')
          .eq('employee_id', employeeId)
          .order('timestamp', { ascending: false })
          .limit(5)

        if (statusError) {
          console.error('Failed to fetch drawer status:', statusError)
        }

        response = {
          success: true,
          message: 'Cash drawer status retrieved',
          timestamp,
          // Note: Physical status detection requires hardware feedback
          // This is a simulated status based on recent activity
        }
        break

      case 'close':
        // Note: Most cash drawers don't have electronic closing mechanism
        // This is mainly for logging purposes
        const { data: closeLog, error: closeError } = await supabase
          .from('cash_drawer_logs')
          .insert({
            employee_id: employeeId,
            transaction_id: transactionId,
            action: 'close',
            reason: reason || 'Manual close',
            timestamp: timestamp,
            success: true
          })
          .select()
          .single()

        if (closeError) {
          console.error('Failed to log close action:', closeError)
        }

        response = {
          success: true,
          message: 'Cash drawer close logged (manual action required)',
          timestamp,
          logId: closeLog?.id
        }
        break

      default:
        return new Response(
          JSON.stringify({ success: false, message: 'Invalid action. Use: open, close, status, or test' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Cash drawer function error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Internal server error',
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/cash-drawer' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
