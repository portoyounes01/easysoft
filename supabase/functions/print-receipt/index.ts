// Receipt Printing Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface PrintRequest {
  transactionId: string
  receiptType: 'customer' | 'merchant' | 'test'
  printerSettings?: {
    width: number // characters per line (typically 32, 42, or 48)
    fontSize: 'small' | 'normal' | 'large'
    copies: number
  }
  employeeId?: string
}

interface ReceiptData {
  storeName: string
  storeAddress: string
  storePhone: string
  transactionNumber: string
  date: string
  time: string
  employeeName: string
  items: Array<{
    name: string
    quantity: number
    price: number
    total: number
  }>
  subtotal: number
  tax: number
  discount: number
  total: number
  paymentMethod: string
  customerName?: string
  receiptFooter?: string
}

// ESC/POS Command Generator
class ESCPOSGenerator {
  private commands: number[] = []
  private width: number

  constructor(width: number = 48) {
    this.width = width
    this.initialize()
  }

  private initialize() {
    // Initialize printer
    this.commands.push(0x1B, 0x40) // ESC @
  }

  // Text formatting commands
  bold(enable: boolean = true) {
    this.commands.push(0x1B, 0x45, enable ? 1 : 0) // ESC E
    return this
  }

  underline(enable: boolean = true) {
    this.commands.push(0x1B, 0x2D, enable ? 1 : 0) // ESC -
    return this
  }

  fontSize(size: 'small' | 'normal' | 'large') {
    switch (size) {
      case 'small':
        this.commands.push(0x1B, 0x21, 0x01) // ESC !
        break
      case 'large':
        this.commands.push(0x1B, 0x21, 0x30) // ESC !
        break
      default: // normal
        this.commands.push(0x1B, 0x21, 0x00) // ESC !
    }
    return this
  }

  // Alignment
  align(alignment: 'left' | 'center' | 'right') {
    const alignValue = alignment === 'left' ? 0 : alignment === 'center' ? 1 : 2
    this.commands.push(0x1B, 0x61, alignValue) // ESC a
    return this
  }

  // Add text
  text(content: string) {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(content)
    this.commands.push(...Array.from(bytes))
    return this
  }

  // Add line break
  newLine(count: number = 1) {
    for (let i = 0; i < count; i++) {
      this.commands.push(0x0A) // LF
    }
    return this
  }

  // Add separator line
  separator(char: string = '-') {
    const line = char.repeat(this.width)
    this.text(line).newLine()
    return this
  }

  // Format two-column text (e.g., "Item Name    €10.00")
  twoColumn(left: string, right: string) {
    const maxLeft = this.width - right.length
    const leftTrimmed = left.length > maxLeft ? left.substring(0, maxLeft - 3) + '...' : left
    const spaces = ' '.repeat(this.width - leftTrimmed.length - right.length)
    this.text(leftTrimmed + spaces + right).newLine()
    return this
  }

  // Cut paper
  cut() {
    this.commands.push(0x1D, 0x56, 0x42, 0x00) // GS V B
    return this
  }

  // Open cash drawer
  openDrawer() {
    this.commands.push(0x1B, 0x70, 0x00, 0x19, 0xFA) // ESC p
    return this
  }

  // Get final command array
  getCommands(): number[] {
    return [...this.commands]
  }
}

function generateReceipt(data: ReceiptData, settings: PrintRequest['printerSettings']): number[] {
  const width = settings?.width || 48
  const printer = new ESCPOSGenerator(width)

  // Header
  printer
    .align('center')
    .bold(true)
    .fontSize('large')
    .text(data.storeName)
    .newLine()
    .fontSize('normal')
    .bold(false)
    .text(data.storeAddress)
    .newLine()
    .text(data.storePhone)
    .newLine(2)

  // Transaction info
  printer
    .align('left')
    .separator('=')
    .twoColumn('Receipt #:', data.transactionNumber)
    .twoColumn('Date:', data.date)
    .twoColumn('Time:', data.time)
    .twoColumn('Cashier:', data.employeeName)
    
  if (data.customerName) {
    printer.twoColumn('Customer:', data.customerName)
  }
  
  printer.separator('=').newLine()

  // Items
  printer
    .bold(true)
    .text('ITEMS')
    .newLine()
    .bold(false)
    .separator('-')

  data.items.forEach(item => {
    const itemLine = `${item.quantity}x ${item.name}`
    const priceLine = `€${item.total.toFixed(2)}`
    printer.twoColumn(itemLine, priceLine)
    
    if (item.quantity > 1) {
      printer
        .align('right')
        .text(`@ €${item.price.toFixed(2)} each`)
        .newLine()
        .align('left')
    }
  })

  // Totals
  printer
    .separator('-')
    .twoColumn('Subtotal:', `€${data.subtotal.toFixed(2)}`)

  if (data.discount > 0) {
    printer.twoColumn('Discount:', `-€${data.discount.toFixed(2)}`)
  }

  printer
    .twoColumn('Tax:', `€${data.tax.toFixed(2)}`)
    .separator('=')
    .bold(true)
    .fontSize('large')
    .twoColumn('TOTAL:', `€${data.total.toFixed(2)}`)
    .fontSize('normal')
    .bold(false)
    .newLine()
    .twoColumn('Payment:', data.paymentMethod)
    .newLine(2)

  // Footer
  printer
    .align('center')
    .text(data.receiptFooter || 'Thank you for your business!')
    .newLine()
    .text('Please keep your receipt')
    .newLine(3)

  // Cut paper
  printer.cut()

  return printer.getCommands()
}

function generateTestReceipt(width: number = 48): number[] {
  const printer = new ESCPOSGenerator(width)

  printer
    .align('center')
    .bold(true)
    .fontSize('large')
    .text('PRINTER TEST')
    .newLine()
    .fontSize('normal')
    .bold(false)
    .text('Cash Register System')
    .newLine(2)
    .separator('=')
    .align('left')
    .text('Font Test:')
    .newLine()
    .fontSize('small')
    .text('Small font size')
    .newLine()
    .fontSize('normal')
    .text('Normal font size')
    .newLine()
    .fontSize('large')
    .text('Large font size')
    .newLine()
    .fontSize('normal')
    .newLine()
    .text('Formatting Test:')
    .newLine()
    .bold(true)
    .text('Bold text')
    .newLine()
    .bold(false)
    .underline(true)
    .text('Underlined text')
    .newLine()
    .underline(false)
    .newLine()
    .align('center')
    .text('Centered text')
    .newLine()
    .align('right')
    .text('Right aligned')
    .newLine()
    .align('left')
    .newLine()
    .text('Character set test:')
    .newLine()
    .text('€ $ £ ¥ © ® ™ ° ± × ÷')
    .newLine()
    .text('áéíóú àèìòù âêîôû ãõ')
    .newLine()
    .text('ÁÉÍÓÚ ÀÈÌÒÙ ÂÊÎÔÛ ÃÕ')
    .newLine()
    .text('ç Ç ñ Ñ ü Ü')
    .newLine(2)
    .align('center')
    .separator('=')
    .text('Test completed successfully!')
    .newLine()
    .text(new Date().toLocaleString())
    .newLine(3)
    .cut()

  return printer.getCommands()
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
    const { transactionId, receiptType, printerSettings, employeeId }: PrintRequest = await req.json()

    // For test receipts, we don't need a transaction
    if (receiptType === 'test') {
      const commands = generateTestReceipt(printerSettings?.width || 48)
      
      return new Response(
        JSON.stringify({
          success: true,
          receiptType: 'test',
          commands,
          message: 'Test receipt generated successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // For customer/merchant receipts, we need transaction data
    if (!transactionId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Transaction ID required for customer/merchant receipts' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch transaction data
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select(`
        *,
        transaction_items (
          id,
          product_name,
          quantity,
          unit_price,
          line_total
        )
      `)
      .eq('id', transactionId)
      .single()

    if (transactionError || !transaction) {
      return new Response(
        JSON.stringify({ success: false, message: 'Transaction not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format receipt data
    const receiptData: ReceiptData = {
      storeName: 'YOUR STORE NAME', // TODO: Get from settings
      storeAddress: 'Store Address Line 1\nStore Address Line 2',
      storePhone: 'Tel: +351 123 456 789',
      transactionNumber: transaction.transaction_number || transaction.id.substring(0, 8),
      date: new Date(transaction.transaction_date).toLocaleDateString('pt-PT'),
      time: transaction.transaction_time || new Date(transaction.created_at).toLocaleTimeString('pt-PT'),
      employeeName: transaction.employee_name || 'Unknown',
      items: transaction.transaction_items.map((item: any) => ({
        name: item.product_name,
        quantity: item.quantity,
        price: item.unit_price,
        total: item.line_total
      })),
      subtotal: transaction.subtotal,
      tax: transaction.tax,
      discount: transaction.discount || 0,
      total: transaction.total,
      paymentMethod: transaction.payment_method,
      customerName: transaction.customer_name,
      receiptFooter: receiptType === 'merchant' ? 'MERCHANT COPY' : undefined
    }

    // Generate receipt commands
    const commands = generateReceipt(receiptData, printerSettings)

    // Log the print action
    if (employeeId) {
      await supabase
        .from('print_logs')
        .insert({
          employee_id: employeeId,
          transaction_id: transactionId,
          receipt_type: receiptType,
          timestamp: new Date().toISOString(),
          success: true
        })
    }

    return new Response(
      JSON.stringify({
        success: true,
        receiptType,
        transactionId,
        commands,
        message: `${receiptType} receipt generated successfully`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Print receipt function error:', error)
    
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

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/print-receipt' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
