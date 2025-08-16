# Printer Workflow System Documentation

## Overview

The Printer Workflow System provides automatic order routing to multiple printer stations based on product categories. This allows restaurants to send different parts of an order to appropriate kitchen stations while maintaining a full receipt for the customer.

## Key Features

- **Automatic Routing**: Orders are automatically sent to the correct stations based on product categories
- **Advanced Routing Rules**: Configure complex routing based on products, categories, menus, or custom tags
- **Multiple Station Support**: Each station can have multiple printers for redundancy
- **Multi-Station Products**: Single products can print to multiple stations (e.g., pizza to both dough and topping stations)
- **Simultaneous Printing**: All relevant stations print immediately when an order is placed
- **Environment Awareness**: Different printer categories available in POS vs Web interface
- **Easy Configuration**: Simple UI for setting up printer stations and assignments
- **Routing Debugger**: Test and debug routing rules before going live

## Architecture

### Components

1. **PrinterWorkflowManager**: Main configuration interface for setting up stations
2. **RoutingRuleManager**: Configure advanced routing rules within each station
3. **OrderPrintManager**: Test interface for printing sample orders
4. **RoutingDebugger**: Debug and test routing rules with custom orders
5. **OrderPrintButton**: Ready-to-use button component for your cashier interface
6. **PrinterWorkflowService**: Core service handling order routing and printing

### Types

- **PrinterCategory**: Defines different types of printer stations (receipt, kitchen, bar, etc.)
- **PrinterStation**: Configuration for a specific printing station
- **OrderPrintRequest**: Order data structure for printing
- **PrintJobResult**: Results from printing attempts

## Quick Start

### 1. Access the Configuration

Navigate to the Printer Test Page and use the tabs:

- **Printer Overview**: Manage physical printers
- **Workflow Configuration**: Set up stations and routing rules
- **Order Printing**: Test with sample orders
- **Routing Debugger**: Debug and test routing rules

### 2. Create Printer Stations

1. Go to "Workflow Configuration" tab
2. Click "Add Station"
3. Choose a category (Receipt, Kitchen, Bar, etc.)
4. Assign physical printers to the station
5. Configure routing rules (see Advanced Routing section)
6. Activate the station

### 3. Configure Routing Rules

1. Edit a station in the Workflow Configuration
2. In the "Routing Rules" section, click "Add Rule"
3. Choose rule type (Product, Category, Menu, Tag)
4. Set the condition (product ID, category ID, etc.)
5. Set priority (higher = evaluated first)
6. Save the rule

### 4. Test Your Configuration

1. Go to "Routing Debugger" tab
2. Add test order items with realistic data
3. Click "Analyze Routing" to see which stations would print
4. Adjust rules as needed

### 5. Use in Your Cashier Interface

```typescript
import { useOrderPrinting } from "../hooks/useOrderPrinting";

const { printOrder } = useOrderPrinting({
  onPrintSuccess: (results) => {
    console.log("Order printed successfully!", results);
  },
});

// When processing an order
const handleCompleteOrder = async (order) => {
  await printOrder({
    orderId: order.id,
    items: order.items,
    customer: order.customer,
    total: order.total,
    employeeName: currentEmployee.name,
  });
};
```

Or use the pre-built component:

```tsx
import OrderPrintButton from "../components/OrderPrintButton";

<OrderPrintButton
  order={currentOrder}
  onPrintComplete={() => console.log("Print completed!")}
/>;
```

## Configuration Guide

### Printer Categories

**Available in POS (Electron)**:

- **Receipt Printers**: Customer receipts and invoices
- **Hot Kitchen**: Hot food preparation station
- **Cold Kitchen**: Cold food and salad station
- **Grill Station**: Grilled items and barbecue
- **Pastry Station**: Bakery and dessert preparation
- **Bar/Beverage Station**: Drinks and beverages

**Available in Web Interface**:

- **Administrative**: Reports, inventory, and management documents

### Station Setup

1. **Station Name**: Descriptive name (e.g., "Main Kitchen", "Bar Station")
2. **Category**: Choose from available categories
3. **Printers**: Assign one or more physical printers
4. **Product Categories**: Map which product categories print to this station

## Advanced Routing Configuration

### Multiple Stations for One Product

Some products may require printing to multiple stations. For example:

- **Pizza**: Prints to both "Dough Station" and "Topping Station"
- **Sandwich**: Prints to both "Prep Station" and "Grill Station"
- **Complex Beverage**: Prints to both "Espresso Station" and "Milk Station"

This is handled through **Routing Rules** in each station configuration.

### Routing Rule Types

1. **Product Rules**: Target specific products by ID or SKU
   - Example: `product: PIZZA001` → Routes this specific pizza to the station
2. **Category Rules**: Target all products in a category
   - Example: `category: beverages` → Routes all beverage items
   - Special: `category: *` → Routes ALL items (useful for receipt printers)
3. **Menu Rules**: Target items from specific menu sections
   - Example: `menu: Lunch Specials` → Routes items from lunch menu
4. **Tag Rules**: Target products with custom tags
   - Example: `tag: requires-oven` → Routes items that need oven preparation
   - Example: `tag: cold-prep` → Routes items for cold preparation

### Rule Priority System

Rules are evaluated by priority (1-100, higher wins):

- **100**: Custom routing overrides (set per order item)
- **50-99**: High priority rules (specific products, urgent items)
- **10-49**: Standard rules (categories, menus)
- **1-9**: Fallback rules (catch-all, legacy)

### Configuration Example

**Pizza Station Setup:**

```
Station: "Pizza Dough Station"
Routing Rules:
- product: PIZZA001 (Priority: 50) - Margherita Pizza
- product: PIZZA002 (Priority: 50) - Pepperoni Pizza
- tag: requires-dough (Priority: 40) - Any item needing dough prep
```

**Topping Station Setup:**

```
Station: "Pizza Topping Station"
Routing Rules:
- product: PIZZA001 (Priority: 50) - Margherita Pizza
- product: PIZZA002 (Priority: 50) - Pepperoni Pizza
- tag: requires-toppings (Priority: 40) - Any item needing toppings
```

Result: Pizza orders print to BOTH stations simultaneously.

## Product Configuration for Advanced Routing

### Enhanced Product Data Structure

To use advanced routing, your products should include:

```typescript
{
  id: "PIZZA001",
  name: "Margherita Pizza",
  categoryId: "550e8400-e29b-41d4-a716-446655440003", // Food category
  productId: "PIZZA001",
  sku: "PIZZA001",
  tags: ["requires-dough", "requires-toppings", "requires-oven"],
  menuName: "Dinner Menu",
  customRouting: ["special-station-id"] // Optional override
}
```

### Setting Up Product Tags

Common tag examples:

- **Preparation Method**: `requires-oven`, `requires-grill`, `cold-prep`, `no-cook`
- **Station Requirements**: `requires-dough`, `requires-toppings`, `requires-sauce`
- **Special Handling**: `allergen-warning`, `made-to-order`, `rush-item`
- **Equipment Needs**: `requires-blender`, `requires-steamer`, `requires-fryer`

### Mapping Products to Stations

1. **Database Level**: Add tags to your product records
2. **Order Processing**: Include tags when sending orders to print
3. **Station Rules**: Configure stations to match on relevant tags
4. **Testing**: Use the Routing Debugger to verify setup

## Workflow Examples

### Example 1: Simple Category Routing

**Order**: Coffee + Bread + Chocolate
**Routing**:

- Receipt Printer: Full order details for customer
- Beverage Station: Coffee order (category rule)
- Bakery Station: Bread order (category rule)
- Confectionery Station: Chocolate order (category rule)
  **Result**: All stations print simultaneously

### Example 2: Multi-Station Product

**Order**: Margherita Pizza
**Product Tags**: `["requires-dough", "requires-toppings", "requires-oven"]`
**Routing**:

- Receipt Printer: Full order (catch-all rule)
- Dough Station: Pizza order (product rule OR tag: requires-dough)
- Topping Station: Pizza order (product rule OR tag: requires-toppings)
- Oven Station: Pizza order (tag: requires-oven)
  **Result**: One pizza prints to 4 different stations

### Example 3: Menu-Based Routing

**Order**: Items from "Lunch Specials" menu
**Routing**:

- Receipt Printer: Full order
- Express Kitchen: All lunch special items (menu rule)
- Regular Kitchen: No items (menu rule doesn't match)
  **Result**: Lunch items go to faster express station

### Example 4: Tag-Based Complex Routing

**Order**: Iced Latte + Grilled Sandwich
**Product Tags**:

- Iced Latte: `["cold-beverage", "requires-espresso", "requires-milk"]`
- Grilled Sandwich: `["hot-food", "requires-grill", "requires-prep"]`

**Routing**:

- Receipt Printer: Both items
- Espresso Station: Iced Latte (tag: requires-espresso)
- Cold Station: Iced Latte (tag: cold-beverage)
- Prep Station: Grilled Sandwich (tag: requires-prep)
- Grill Station: Grilled Sandwich (tag: requires-grill)
  **Result**: Complex items route to multiple specialized stations

## Integration Points

### With Transaction System

The system integrates with your existing transaction structure. When completing a sale, call the print function with your transaction data.

### With Product Categories

Product categories from your database automatically route orders to appropriate stations. Update station configurations when adding new product categories.

### With Employee System

Employee information is included in print jobs for tracking and accountability.

## Troubleshooting

### No Printers Found

1. Ensure printers are connected and powered on
2. Check network connectivity for network printers
3. Refresh the printer list in the Overview tab

### Print Jobs Failing

1. Verify printer status in the Overview tab
2. Check printer assignments in Workflow Configuration
3. Test individual printers using the test buttons

### Missing Print Stations

1. Ensure stations are active and have assigned printers
2. Verify product category mappings
3. Check that printers are connected

### Orders Not Routing

1. Confirm product categories match station configurations
2. Verify stations are active
3. Check that order items have valid category IDs

## API Reference

### PrinterWorkflowService

```typescript
// Process an order for printing
await printerWorkflowService.processOrderPrint(orderRequest);

// Get configured stations
const stations = printerWorkflowService.getStations();

// Save station configuration
printerWorkflowService.saveStation(station);
```

### useOrderPrinting Hook

```typescript
const { printOrder, isConfigured } = useOrderPrinting({
  onPrintSuccess: (results) => {
    /* handle success */
  },
  onPrintError: (error) => {
    /* handle error */
  },
  showNotifications: true,
});
```

## Future Enhancements

This system is designed to be extensible. Possible future additions:

- **Timing Rules**: Delayed printing for specific stations
- **Priority System**: Rush orders, special handling
- **Custom Templates**: Different receipt formats per station
- **Kitchen Display Integration**: Digital order displays
- **Order Status Tracking**: Real-time order progress

## Support

For configuration help or troubleshooting, check the printer status in the Overview tab and verify all stations are properly configured in the Workflow Configuration tab.
