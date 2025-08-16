import { 
  PrinterStation, 
  PrintJob, 
  OrderPrintRequest, 
  PrintJobResult,
  DEFAULT_PRINTER_CATEGORIES
} from '../types/printerWorkflow';

export class PrinterWorkflowService {
  private stations: PrinterStation[] = [];
  private printJobs: PrintJob[] = [];

  constructor() {
    this.loadStations();
  }

  // Load printer stations from localStorage or initialize defaults
  private loadStations(): void {
    try {
      const stored = localStorage.getItem('printerStations');
      if (stored) {
        this.stations = JSON.parse(stored);
        // Migrate old station data to ensure required arrays exist
        this.stations = this.stations.map(station => ({
          ...station,
          printerNames: station.printerNames || [],
          productIds: station.productIds || []
        }));
        this.saveStations(); // Save migrated data
      } else {
        this.initializeDefaultStations();
      }
    } catch (error) {
      console.error('Error loading printer stations:', error);
      this.initializeDefaultStations();
    }
  }

  // Save stations to localStorage
  private saveStations(): void {
    try {
      localStorage.setItem('printerStations', JSON.stringify(this.stations));
    } catch (error) {
      console.error('Error saving printer stations:', error);
    }
  }

  // Initialize default stations
  private initializeDefaultStations(): void {
    this.stations = [
      {
        id: 'receipt-main',
        name: 'Main Receipt Printer',
        description: 'Primary customer receipt printer',
        categoryId: 'receipt',
        printerNames: [], // Will be configured by user
        isActive: true,
        printTemplate: 'receipt',
        productIds: [] // Receipt prints for all orders regardless of products
      }
    ];
    this.saveStations();
  }

  // Get all stations
  getStations(): PrinterStation[] {
    return this.stations;
  }

  // Get stations for specific environment (pos/web)
  getStationsForEnvironment(environment: 'pos' | 'web'): PrinterStation[] {
    const categories = DEFAULT_PRINTER_CATEGORIES.filter(
      cat => cat.availableIn === environment || cat.availableIn === 'both'
    );
    const categoryIds = categories.map(cat => cat.id);
    
    return this.stations.filter(station => 
      categoryIds.includes(station.categoryId) && station.isActive
    );
  }

  // Add or update a station
  saveStation(station: PrinterStation): void {
    const index = this.stations.findIndex(s => s.id === station.id);
    if (index >= 0) {
      this.stations[index] = station;
    } else {
      this.stations.push(station);
    }
    this.saveStations();
  }

  // Remove a station
  removeStation(stationId: string): void {
    this.stations = this.stations.filter(s => s.id !== stationId);
    this.saveStations();
  }

  // Get stations that should print for specific items (simplified product-based routing)
  getStationsForOrderItems(items: OrderPrintRequest['orderData']['items']): PrinterStation[] {
    const targetStations: PrinterStation[] = [];
    
    // Get all product IDs from the order
    const orderProductIds = items
      .map(item => item.productId || item.id || item.sku)
      .filter(Boolean) as string[];

    for (const station of this.stations) {
      if (!station.isActive || station.printerNames.length === 0) continue;

      // Receipt printers always print
      if (station.categoryId === 'receipt') {
        targetStations.push(station);
        continue;
      }

      // Kitchen stations print if they have matching product IDs
      const hasMatchingProducts = station.productIds.some(productId =>
        orderProductIds.includes(productId)
      );

      if (hasMatchingProducts) {
        targetStations.push(station);
      }
    }

    return targetStations;
  }

  // Process an order and generate print jobs
  async processOrderPrint(request: OrderPrintRequest): Promise<PrintJobResult[]> {
    const results: PrintJobResult[] = [];
    
    // Find stations that should print for these items
    const targetStations = this.getStationsForOrderItems(request.orderData.items);

    // Generate print jobs for each station
    for (const station of targetStations) {
      const stationResult: PrintJobResult = {
        stationId: station.id,
        stationName: station.name,
        jobs: []
      };

      // Print to all printers assigned to this station
      for (const printerName of station.printerNames) {
        try {
          const printData = this.preparePrintData(request, station);
          const jobResult = await this.sendPrintJob(printerName, station.printTemplate, printData);
          
          stationResult.jobs.push({
            printerName,
            success: jobResult.success,
            jobId: jobResult.jobId,
            error: jobResult.error
          });

          // Store print job for tracking
          const printJob: PrintJob = {
            id: `${Date.now()}-${station.id}-${printerName}`,
            orderId: request.orderId,
            stationId: station.id,
            printerName,
            template: station.printTemplate,
            data: printData,
            status: jobResult.success ? 'completed' : 'failed',
            createdAt: new Date(),
            completedAt: jobResult.success ? new Date() : undefined,
            error: jobResult.error
          };
          this.printJobs.push(printJob);

        } catch (error) {
          stationResult.jobs.push({
            printerName,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      results.push(stationResult);
    }

    return results;
  }

  // Prepare print data based on station type
  private preparePrintData(request: OrderPrintRequest, station: PrinterStation): any {
    const baseData = {
      orderId: request.orderId,
      date: request.orderData.date,
      stationName: station.name,
      employee: request.orderData.employeeName || 'Unknown'
    };

    switch (station.printTemplate) {
      case 'receipt':
        return {
          ...baseData,
          type: 'receipt',
          customer: request.orderData.customer,
          items: request.orderData.items,
          total: request.orderData.total
        };

      case 'kitchen':
      case 'bar':
        // Filter items relevant to this station based on product IDs
        const relevantItems = request.orderData.items.filter(item => {
          const itemProductId = item.productId || item.id || item.sku;
          return itemProductId && station.productIds.includes(itemProductId);
        });
        
        return {
          ...baseData,
          type: 'kitchen',
          items: relevantItems.length > 0 ? relevantItems : request.orderData.items, // Fallback to all items
          notes: relevantItems.flatMap(item => item.notes || []).filter(Boolean)
        };

      default:
        return baseData;
    }
  }

  // Send print job to printer
  private async sendPrintJob(printerName: string, template: string, data: any): Promise<{
    success: boolean;
    jobId?: string;
    error?: string;
  }> {
    try {
      // Check if we're in Electron environment
      if (window.electronAPI?.hardware) {
        const result = await window.electronAPI.hardware.testPrinterByName(
          printerName, 
          template
        );
        
        return {
          success: result.success,
          jobId: result.jobInfo,
          error: result.error
        };
      } else {
        // Web environment - would integrate with web printing API
        console.log(`Web print job for ${printerName}:`, { template, data });
        return {
          success: true,
          jobId: `web-${Date.now()}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Print job failed'
      };
    }
  }

  // Get print job history
  getPrintJobs(orderId?: string): PrintJob[] {
    if (orderId) {
      return this.printJobs.filter(job => job.orderId === orderId);
    }
    return this.printJobs;
  }

  // Clear old print jobs (keep last 100)
  cleanupPrintJobs(): void {
    if (this.printJobs.length > 100) {
      this.printJobs = this.printJobs
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 100);
    }
  }

  // Get available printer categories for current environment
  getAvailableCategories(): typeof DEFAULT_PRINTER_CATEGORIES {
    const isElectron = window.electronAPI !== undefined;
    const environment = isElectron ? 'pos' : 'web';
    
    return DEFAULT_PRINTER_CATEGORIES.filter(
      cat => cat.availableIn === environment || cat.availableIn === 'both'
    );
  }

  // Add a product to a station
  addProductToStation(stationId: string, productId: string): void {
    const station = this.stations.find(s => s.id === stationId);
    if (station && !station.productIds.includes(productId)) {
      station.productIds.push(productId);
      this.saveStations();
    }
  }

  // Remove a product from a station
  removeProductFromStation(stationId: string, productId: string): void {
    const station = this.stations.find(s => s.id === stationId);
    if (station) {
      station.productIds = station.productIds.filter(id => id !== productId);
      this.saveStations();
    }
  }

  // Get which stations a product will print to
  getStationsForProduct(productId: string): PrinterStation[] {
    return this.stations.filter(station => 
      station.isActive && 
      (station.categoryId === 'receipt' || station.productIds.includes(productId))
    );
  }
}

// Export singleton instance
export const printerWorkflowService = new PrinterWorkflowService();
