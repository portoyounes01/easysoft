# 🍽️ **KITCHEN DISPLAY SYSTEM DESIGN**

## Task #15: Distribute tickets between sections and screen updates

### **🎯 System Overview**

The Kitchen Display System (KDS) provides real-time order management across different kitchen stations, allowing staff to track order progress and update status as items are completed.

---

## **🏗️ Architecture**

### **Station-Based Workflow:**

```typescript
interface KitchenStation {
  id: string;
  name: string; // "Grill", "Fryer", "Salads", "Drinks"
  description: string;
  display_order: number;
  color: string; // UI theme color
  printer_id?: string; // Optional dedicated printer
  estimated_prep_time: number; // Minutes
  is_active: boolean;
}

interface OrderWorkflow {
  order_id: string;
  platform: "glovo" | "ubereats" | "pos";
  order_number: string;
  customer_name: string;
  order_time: string;
  estimated_ready_time: string;
  priority: "low" | "normal" | "high" | "urgent";

  stations: Array<{
    station_id: string;
    station_name: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      modifiers?: string[];
      special_instructions?: string;
    }>;
    status: "pending" | "preparing" | "ready";
    started_at?: string;
    completed_at?: string;
    estimated_completion: string;
  }>;

  overall_status: "received" | "preparing" | "ready" | "completed";
  progress_percentage: number; // Calculated based on station completion
}
```

---

## **📱 Kitchen Display Interface Design**

### **Main Dashboard Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ 🏪 Kitchen Display - Hot Kitchen Station    🔄 Auto-refresh │
├─────────────────────────────────────────────────────────────┤
│ ⏰ Current Time: 14:30  📊 Orders: 12 Active  ⚡ Avg: 8min │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ 🆘 URGENT   │ │ ⚡ HIGH     │ │ 📋 NORMAL   │            │
│ │ DEL-001     │ │ DEL-003     │ │ DEL-005     │            │
│ │ 🍕 2x Pizza │ │ 🍔 Burger   │ │ 🥗 Salad    │            │
│ │ ⏱️ -3 min   │ │ ⏱️ 2 min    │ │ ⏱️ 5 min    │            │
│ │ [START] ✅  │ │ [READY] ✅  │ │ [START] ⏸️  │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
│                                                             │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ 📋 NORMAL   │ │ 📋 NORMAL   │ │ ➕ More...  │            │
│ │ DEL-007     │ │ POS-123     │ │ (8 orders)  │            │
│ │ 🍖 Steak    │ │ 🥤 Drinks   │ │             │            │
│ │ ⏱️ 12 min   │ │ ⏱️ 1 min    │ │             │            │
│ │ [START] ⏸️  │ │ [READY] ✅  │ │             │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### **Individual Order Card Design:**

```typescript
interface OrderCard {
  // Header
  order_number: string;
  platform_icon: "glovo" | "ubereats" | "pos";
  priority_indicator: "red" | "orange" | "blue" | "gray";
  time_indicator: "overdue" | "urgent" | "normal";

  // Items for this station
  items: Array<{
    name: string;
    quantity: number;
    modifiers: string[];
    special_instructions?: string;
    allergen_warnings?: string[];
  }>;

  // Timing
  estimated_time: number; // minutes
  elapsed_time: number; // minutes since order placed
  remaining_time: number; // positive = on time, negative = overdue

  // Actions
  available_actions: Array<"start" | "pause" | "ready" | "help">;

  // Status
  current_status: "pending" | "preparing" | "ready";
}
```

---

## **⚡ Real-Time Features**

### **Live Updates:**

```typescript
// WebSocket integration for real-time updates
interface KitchenDisplayWebSocket {
  // Incoming events
  onNewOrder: (order: OrderWorkflow) => void;
  onOrderUpdate: (orderId: string, updates: Partial<OrderWorkflow>) => void;
  onOrderCancellation: (orderId: string, reason: string) => void;
  onStationStatusChange: (stationId: string, status: StationStatus) => void;

  // Outgoing events
  markItemReady: (orderId: string, stationId: string) => void;
  startPreparation: (orderId: string, stationId: string) => void;
  requestHelp: (orderId: string, issue: string) => void;
  updateEstimatedTime: (orderId: string, newEstimate: number) => void;
}

// Auto-refresh logic
const REFRESH_INTERVALS = {
  orders: 2000, // 2 seconds - order status updates
  timing: 1000, // 1 second - countdown timers
  station_status: 5000, // 5 seconds - station availability
};
```

### **Sound Notifications:**

```typescript
interface SoundNotifications {
  newOrder: {
    enabled: boolean;
    sound: "chime" | "bell" | "beep";
    volume: number; // 0-100
  };
  urgentOrder: {
    enabled: boolean;
    sound: "alarm" | "urgent-beep";
    volume: number;
    repeat: boolean;
  };
  orderReady: {
    enabled: boolean;
    sound: "success" | "ding";
    volume: number;
  };
}
```

---

## **🎯 Station-Specific Views**

### **Hot Kitchen Station:**

- Focus on items requiring cooking (grill, fryer, oven)
- Temperature and timing critical items
- Cooking instructions and special requests
- Equipment status indicators

### **Cold Station:**

- Salads, sandwiches, cold appetizers
- Assembly instructions
- Fresh ingredient availability
- Quick turnaround items

### **Drinks Station:**

- Beverages, desserts, ice cream
- Simple preparation items
- Fastest completion times
- Packaging requirements

### **Packaging Station:**

- Final assembly and quality check
- Order completeness verification
- Special packaging instructions
- Delivery preparation

---

## **📋 Order Priority Algorithm**

```typescript
function calculateOrderPriority(
  order: OrderWorkflow
): "urgent" | "high" | "normal" | "low" {
  const now = new Date();
  const orderTime = new Date(order.order_time);
  const estimatedReady = new Date(order.estimated_ready_time);

  const elapsedMinutes = (now.getTime() - orderTime.getTime()) / (1000 * 60);
  const remainingMinutes =
    (estimatedReady.getTime() - now.getTime()) / (1000 * 60);

  // Overdue orders
  if (remainingMinutes < -5) return "urgent";

  // Due soon or slightly overdue
  if (remainingMinutes < 2) return "high";

  // Normal timing
  if (remainingMinutes < 15) return "normal";

  // Future orders
  return "low";
}

// Sort orders by priority and timing
function sortOrdersForDisplay(orders: OrderWorkflow[]): OrderWorkflow[] {
  return orders.sort((a, b) => {
    const priorityWeight = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };

    // First sort by priority
    const priorityDiff =
      priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by estimated ready time
    return (
      new Date(a.estimated_ready_time).getTime() -
      new Date(b.estimated_ready_time).getTime()
    );
  });
}
```

---

## **🖨️ Station Printing Integration**

### **Automatic Ticket Printing:**

```typescript
interface StationTicket {
  station_name: string;
  order_number: string;
  platform: string;
  customer_name: string;
  order_time: string;
  items: Array<{
    quantity: number;
    name: string;
    modifiers: string[];
    special_instructions?: string;
  }>;
  estimated_ready_time: string;
  priority: string;
}

// Print ticket when order arrives
async function printStationTicket(
  station: KitchenStation,
  order: OrderWorkflow
) {
  if (!station.printer_id) return;

  const ticket = generateStationTicket(station, order);
  const escposCommands = formatTicketForPrinting(ticket);

  await sendToPrinter(station.printer_id, escposCommands);

  // Log printing activity
  await logPrintingActivity({
    station_id: station.id,
    order_id: order.order_id,
    printed_at: new Date(),
    success: true,
  });
}
```

---

## **📊 Kitchen Performance Analytics**

### **Real-time Metrics:**

```typescript
interface KitchenMetrics {
  current_orders: number;
  average_prep_time: number;
  on_time_percentage: number;
  station_efficiency: Record<
    string,
    {
      orders_completed: number;
      average_time: number;
      current_load: number;
    }
  >;
  peak_hours: Array<{
    hour: number;
    order_count: number;
  }>;
}

// Display metrics on kitchen dashboard
function displayMetrics(metrics: KitchenMetrics) {
  return (
    <div className="kitchen-metrics">
      <div className="metric-card">
        <span className="metric-value">{metrics.current_orders}</span>
        <span className="metric-label">Active Orders</span>
      </div>
      <div className="metric-card">
        <span className="metric-value">{metrics.average_prep_time}min</span>
        <span className="metric-label">Avg Prep Time</span>
      </div>
      <div className="metric-card">
        <span className="metric-value">{metrics.on_time_percentage}%</span>
        <span className="metric-label">On Time</span>
      </div>
    </div>
  );
}
```

---

## **🔧 Configuration Options**

### **Station Settings:**

```typescript
interface StationSettings {
  display_preferences: {
    cards_per_row: number;
    show_customer_names: boolean;
    show_order_times: boolean;
    show_special_instructions: boolean;
    compact_mode: boolean;
  };

  notification_settings: {
    sound_enabled: boolean;
    sound_volume: number;
    visual_alerts: boolean;
    vibration_enabled: boolean; // For tablet devices
  };

  workflow_settings: {
    auto_start_timer: boolean;
    require_confirmation: boolean;
    allow_time_override: boolean;
    show_other_stations: boolean;
  };
}
```

### **Global Kitchen Settings:**

```typescript
interface KitchenGlobalSettings {
  refresh_interval: number;
  max_orders_displayed: number;
  time_zone: string;
  default_prep_time: number;
  overtime_threshold: number; // Minutes before marked as overdue

  integration_settings: {
    auto_accept_orders: boolean;
    print_on_arrival: boolean;
    notify_management: boolean;
    send_ready_notifications: boolean;
  };
}
```

---

## **📱 Mobile/Tablet Optimization**

### **Touch Interface:**

- Large, finger-friendly buttons
- Swipe gestures for status changes
- Voice commands for hands-free operation
- Haptic feedback for confirmations

### **Responsive Design:**

```css
/* Kitchen display responsive breakpoints */
.kitchen-display {
  --card-size: 280px;
  --gap-size: 16px;
}

@media (max-width: 768px) {
  .kitchen-display {
    --card-size: 100%;
    --gap-size: 8px;
  }
}

@media (min-width: 1920px) {
  .kitchen-display {
    --card-size: 320px;
    --gap-size: 24px;
  }
}
```

---

## **🚀 Implementation Phases**

### **Phase 1: Basic Display (Week 1)**

- Order card layout
- Station filtering
- Manual status updates
- Basic timing display

### **Phase 2: Real-time Updates (Week 2)**

- WebSocket integration
- Live order updates
- Automatic refreshing
- Sound notifications

### **Phase 3: Advanced Features (Week 3)**

- Priority algorithms
- Performance metrics
- Printing integration
- Mobile optimization

### **Phase 4: Analytics & Optimization (Week 4)**

- Reporting dashboard
- Performance analytics
- Configuration options
- Staff training materials

This Kitchen Display System will transform your order management workflow, providing clear visibility and efficient coordination across all kitchen stations.
