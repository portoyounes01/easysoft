// Comprehensive Cashier Testing Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface TestRequest {
  testType: 'cash-drawer' | 'printer-test' | 'full-sequence' | 'hardware-check' | 'all-tests'
  employeeId: string
  settings?: {
    printerWidth?: number
    drawerType?: 'standard' | 'alternative'
    includeSound?: boolean
  }
}

interface TestResult {
  testName: string
  description: string
  commands?: number[]
  expectedResult: string
  instructions: string[]
  success: boolean
  timestamp: string
  logId?: string
}

interface TestSuite {
  success: boolean
  message: string
  tests: TestResult[]
  totalTests: number
  timestamp: string
}

// Test command generators
const generateDrawerTest = (type: 'standard' | 'alternative' = 'standard'): number[] => {
  return type === 'standard' 
    ? [0x1B, 0x70, 0x00, 0x19, 0xFA] // ESC p 0 25 250
    : [0x1B, 0x70, 0x01, 0x19, 0xFA] // ESC p 1 25 250
}

const generatePrinterTest = (width: number = 48): number[] => {
  const commands: number[] = []
  
  // Initialize
  commands.push(0x1B, 0x40) // ESC @
  
  // Header
  commands.push(0x1B, 0x61, 0x01) // Center align
  commands.push(0x1B, 0x21, 0x30) // Large font
  commands.push(...Array.from(new TextEncoder().encode('HARDWARE TEST')))
  commands.push(0x0A) // New line
  
  commands.push(0x1B, 0x21, 0x00) // Normal font
  commands.push(...Array.from(new TextEncoder().encode('Cashier System Check')))
  commands.push(0x0A, 0x0A) // Two new lines
  
  // Alignment test
  commands.push(0x1B, 0x61, 0x00) // Left align
  commands.push(...Array.from(new TextEncoder().encode('Left aligned text')))
  commands.push(0x0A)
  
  commands.push(0x1B, 0x61, 0x01) // Center align
  commands.push(...Array.from(new TextEncoder().encode('Center aligned text')))
  commands.push(0x0A)
  
  commands.push(0x1B, 0x61, 0x02) // Right align
  commands.push(...Array.from(new TextEncoder().encode('Right aligned text')))
  commands.push(0x0A, 0x0A)
  
  // Character test
  commands.push(0x1B, 0x61, 0x00) // Left align
  commands.push(...Array.from(new TextEncoder().encode('Character test:')))
  commands.push(0x0A)
  commands.push(...Array.from(new TextEncoder().encode('€ $ £ ¥ © ® ™')))
  commands.push(0x0A)
  commands.push(...Array.from(new TextEncoder().encode('Portuguese: ção ñ')))
  commands.push(0x0A, 0x0A)
  
  // Separator line
  const separator = '-'.repeat(width)
  commands.push(...Array.from(new TextEncoder().encode(separator)))
  commands.push(0x0A)
  
  // Format test
  commands.push(0x1B, 0x45, 0x01) // Bold on
  commands.push(...Array.from(new TextEncoder().encode('Bold text test')))
  commands.push(0x0A)
  commands.push(0x1B, 0x45, 0x00) // Bold off
  
  commands.push(0x1B, 0x2D, 0x01) // Underline on
  commands.push(...Array.from(new TextEncoder().encode('Underlined text test')))
  commands.push(0x0A)
  commands.push(0x1B, 0x2D, 0x00) // Underline off
  
  // Timestamp
  commands.push(0x0A)
  commands.push(...Array.from(new TextEncoder().encode(`Test Date: ${new Date().toLocaleString('pt-PT')}`)))
  commands.push(0x0A, 0x0A, 0x0A)
  
  // Cut paper
  commands.push(0x1D, 0x56, 0x42, 0x00) // GS V B
  
  return commands
}

const generateFullSequence = (printerWidth: number = 48, drawerType: 'standard' | 'alternative' = 'standard'): number[] => {
  const commands: number[] = []
  
  // 1. Print receipt header
  commands.push(0x1B, 0x40) // Initialize
  commands.push(0x1B, 0x61, 0x01) // Center
  commands.push(0x1B, 0x21, 0x30) // Large font
  commands.push(...Array.from(new TextEncoder().encode('TRANSACTION COMPLETE')))
  commands.push(0x0A, 0x0A)
  
  // 2. Transaction details
  commands.push(0x1B, 0x21, 0x00) // Normal font
  commands.push(0x1B, 0x61, 0x00) // Left align
  
  const details = [
    'Receipt #: TEST-001',
    `Date: ${new Date().toLocaleDateString('pt-PT')}`,
    `Time: ${new Date().toLocaleTimeString('pt-PT')}`,
    'Cashier: Test User',
    '',
    'Test Item 1         €10.00',
    'Test Item 2         €15.50',
    ''.padEnd(printerWidth, '-'),
    'TOTAL:              €25.50',
    'Payment: Cash',
    '',
    'Thank you for your purchase!',
    'Please keep your receipt'
  ]
  
  details.forEach(line => {
    commands.push(...Array.from(new TextEncoder().encode(line)))
    commands.push(0x0A)
  })
  
  commands.push(0x0A, 0x0A)
  
  // 3. Cut paper
  commands.push(0x1D, 0x56, 0x42, 0x00)
  
  // 4. Open cash drawer
  commands.push(...generateDrawerTest(drawerType))
  
  return commands
}

// Hardware check function
const generateHardwareCheck = (): TestResult[] => {
  return [
    {
      testName: 'Power Supply Check',
      description: 'Verify printer and cash drawer power connections',
      expectedResult: 'All devices should have stable power indicators',
      instructions: [
        '1. Check printer power LED (should be solid green/blue)',
        '2. Check cash drawer connection to printer',
        '3. Verify USB/Serial cable connections',
        '4. Listen for printer ready sound (if applicable)'
      ],
      success: true,
      timestamp: new Date().toISOString()
    },
    {
      testName: 'Paper Check',
      description: 'Verify thermal paper is loaded correctly',
      expectedResult: 'Paper should be loaded with thermal side facing print head',
      instructions: [
        '1. Open printer cover',
        '2. Check paper roll position',
        '3. Verify paper feeds smoothly',
        '4. Close printer cover securely'
      ],
      success: true,
      timestamp: new Date().toISOString()
    },
    {
      testName: 'Communication Test',
      description: 'Test data communication between POS and hardware',
      expectedResult: 'System should detect connected devices',
      instructions: [
        '1. Check device manager for connected printers',
        '2. Verify COM port assignments',
        '3. Test baud rate settings (usually 9600 or 38400)',
        '4. Confirm driver installation'
      ],
      success: true,
      timestamp: new Date().toISOString()
    }
  ]
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

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
    const { testType, employeeId, settings }: TestRequest = await req.json()

    if (!testType || !employeeId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: testType, employeeId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const timestamp = new Date().toISOString()
    const printerWidth = settings?.printerWidth || 48
    const drawerType = settings?.drawerType || 'standard'

    let testSuite: TestSuite = {
      success: true,
      message: '',
      tests: [],
      totalTests: 0,
      timestamp
    }

    switch (testType) {
      case 'cash-drawer':
        const drawerTest: TestResult = {
          testName: 'Cash Drawer Test',
          description: 'Test cash drawer opening mechanism',
          commands: generateDrawerTest(drawerType),
          expectedResult: 'Cash drawer should open with audible click/pop sound',
          instructions: [
            '1. Ensure cash drawer is closed',
            '2. Send the open command',
            '3. Listen for the drawer opening sound',
            '4. Verify drawer physically opens',
            '5. Manually close the drawer'
          ],
          success: true,
          timestamp
        }
        
        // Log the test
        const { data: drawerLog, error: drawerError } = await supabase
          .from('cashier_tests')
          .insert({
            employee_id: employeeId,
            test_type: 'cash-drawer',
            test_details: { drawerType },
            timestamp,
            success: true
          })
          .select()
          .single()

        if (!drawerError) {
          drawerTest.logId = drawerLog.id
        }

        testSuite.tests = [drawerTest]
        testSuite.totalTests = 1
        testSuite.message = 'Cash drawer test prepared'
        break

      case 'printer-test':
        const printerTest: TestResult = {
          testName: 'Thermal Printer Test',
          description: 'Test printer functionality and print quality',
          commands: generatePrinterTest(printerWidth),
          expectedResult: 'Should print a test page with various fonts and formatting',
          instructions: [
            '1. Check paper is loaded correctly',
            '2. Send print command',
            '3. Verify all text prints clearly',
            '4. Check alignment and formatting',
            '5. Confirm paper cuts properly'
          ],
          success: true,
          timestamp
        }

        // Log the test
        const { data: printerLog, error: printerError } = await supabase
          .from('cashier_tests')
          .insert({
            employee_id: employeeId,
            test_type: 'printer-test',
            test_details: { printerWidth },
            timestamp,
            success: true
          })
          .select()
          .single()

        if (!printerError) {
          printerTest.logId = printerLog.id
        }

        testSuite.tests = [printerTest]
        testSuite.totalTests = 1
        testSuite.message = 'Printer test prepared'
        break

      case 'full-sequence':
        const sequenceTest: TestResult = {
          testName: 'Full Transaction Sequence',
          description: 'Test complete transaction flow: print receipt then open drawer',
          commands: generateFullSequence(printerWidth, drawerType),
          expectedResult: 'Should print receipt and then open cash drawer',
          instructions: [
            '1. Prepare for full transaction test',
            '2. Receipt should print first',
            '3. Cash drawer should open after printing',
            '4. Verify receipt content and formatting',
            '5. Confirm drawer opens correctly',
            '6. Close drawer manually'
          ],
          success: true,
          timestamp
        }

        // Log the test
        const { data: sequenceLog, error: sequenceError } = await supabase
          .from('cashier_tests')
          .insert({
            employee_id: employeeId,
            test_type: 'full-sequence',
            test_details: { printerWidth, drawerType },
            timestamp,
            success: true
          })
          .select()
          .single()

        if (!sequenceError) {
          sequenceTest.logId = sequenceLog.id
        }

        testSuite.tests = [sequenceTest]
        testSuite.totalTests = 1
        testSuite.message = 'Full sequence test prepared'
        break

      case 'hardware-check':
        const hardwareTests = generateHardwareCheck()
        
        testSuite.tests = hardwareTests
        testSuite.totalTests = hardwareTests.length
        testSuite.message = 'Hardware checklist prepared'

        // Log the hardware check
        await supabase
          .from('cashier_tests')
          .insert({
            employee_id: employeeId,
            test_type: 'hardware-check',
            test_details: { checkCount: hardwareTests.length },
            timestamp,
            success: true
          })
        break

      case 'all-tests':
        const allTests: TestResult[] = [
          {
            testName: 'Cash Drawer Test',
            description: 'Test cash drawer opening',
            commands: generateDrawerTest(drawerType),
            expectedResult: 'Drawer opens with click sound',
            instructions: ['Send command', 'Verify drawer opens', 'Close manually'],
            success: true,
            timestamp
          },
          {
            testName: 'Printer Test',
            description: 'Test printer functionality',
            commands: generatePrinterTest(printerWidth),
            expectedResult: 'Test page prints correctly',
            instructions: ['Check paper', 'Send print', 'Verify output'],
            success: true,
            timestamp
          },
          {
            testName: 'Full Sequence',
            description: 'Complete transaction flow',
            commands: generateFullSequence(printerWidth, drawerType),
            expectedResult: 'Receipt prints, drawer opens',
            instructions: ['Run sequence', 'Check receipt', 'Verify drawer'],
            success: true,
            timestamp
          },
          ...generateHardwareCheck()
        ]

        testSuite.tests = allTests
        testSuite.totalTests = allTests.length
        testSuite.message = 'Complete test suite prepared'

        // Log comprehensive test
        await supabase
          .from('cashier_tests')
          .insert({
            employee_id: employeeId,
            test_type: 'all-tests',
            test_details: { 
              totalTests: allTests.length,
              printerWidth,
              drawerType 
            },
            timestamp,
            success: true
          })
        break

      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Invalid test type. Use: cash-drawer, printer-test, full-sequence, hardware-check, or all-tests' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify(testSuite),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Cashier test function error:', error)
    
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

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/test-cashier' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
