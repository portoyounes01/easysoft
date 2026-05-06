# POS System Style Guide

## 🎨 **Design Philosophy**

This POS system is designed with **touch-first, accessibility-focused, and retail-optimized** principles. Every design decision prioritizes efficiency, clarity, and ease of use in high-pressure retail environments.

---

## 🌈 **Color System**

### **Primary Brand Colors**
```css
/* Main Brand Gradient */
from-blue-900 via-purple-900 to-slate-900  /* Background gradient */
from-blue-500 to-purple-600                /* Primary action gradient */
from-blue-600 to-purple-600                /* Primary buttons */
```

### **Role-Based Color Coding**
```css
/* Employee Roles */
from-red-500 to-pink-600      /* Admin - Red/Pink */
from-orange-500 to-amber-600  /* Manager - Orange/Amber */
from-blue-500 to-purple-600   /* Cashier - Blue/Purple */
from-gray-500 to-slate-600    /* Default/Unknown */
```

### **Functional Colors**
```css
/* Actions */
bg-green-500 hover:bg-green-600   /* Success/Confirm/Active */
bg-red-500 hover:bg-red-600       /* Delete/Danger/Cancel */
bg-orange-500 hover:bg-orange-600 /* Warning/Clear */
bg-blue-500 hover:bg-blue-600     /* Info/Toggle */
bg-gray-500 hover:bg-gray-600     /* Neutral/Back */
```

### **UI Neutrals**
```css
/* Backgrounds */
bg-white           /* Card backgrounds */
bg-gray-50         /* Input backgrounds */
bg-gray-100        /* Keyboard background */
bg-gray-900        /* Dark text */

/* Text */
text-gray-800      /* Primary text */
text-gray-600      /* Secondary text */
text-gray-400      /* Tertiary text */
text-white         /* Text on colored backgrounds */
```

---

## 📝 **Typography Scale**

### **Heading Hierarchy**
```css
text-6xl font-bold     /* Main screen titles (96px) */
text-4xl font-bold     /* Card titles (36px) */
text-3xl font-bold     /* Employee names (30px) */
text-2xl font-semibold /* Section labels (24px) */
text-xl font-medium    /* Subsection labels (20px) */
text-lg font-medium    /* Button text (18px) */
```

### **Body Text**
```css
text-2xl    /* Large input text */
text-xl     /* Button labels */
text-lg     /* Important info */
text-base   /* Regular content */
text-sm     /* Helper text */
text-xs     /* Fine print */
```

### **Font Weights**
```css
font-bold      /* Titles, important info */
font-semibold  /* Section headers */
font-medium    /* Button text, labels */
font-normal    /* Body text */
```

---

## 🎯 **Touch Screen Optimization**

### **Minimum Touch Targets**
```css
min-h-touch    /* ~60px at 16px root; rem-based (`3.75rem`) — primary POS target */
min-h-touch-sm /* ~52px — menus / secondary rows */
min-h-touch-xs /* ~44px — minimum comfortable tap band */
min-h-20       /* Large action buttons (~5rem / ~80px at 16px root) */
min-h-70       /* Tall selection surfaces (~17.5rem / ~280px at 16px root), e.g. employee cards */

/* Touch padding */
p-4            /* Standard button padding */
p-6            /* Large button padding */
p-8            /* Card padding */
```

### **Spacing Scale**
```css
/* Gap spacing for touch interfaces */
gap-2   /* 8px - Tight spacing (keyboard keys) */
gap-4   /* 16px - Standard spacing */
gap-6   /* 24px - Comfortable spacing */
gap-8   /* 32px - Large spacing (cards) */
gap-12  /* 48px - Section spacing */
```

---

## 🏗️ **Component Patterns**

### **Card Component Structure**
```tsx
<div className="bg-white rounded-3xl shadow-2xl p-8">
  {/* Icon/Avatar */}
  <div className="bg-gradient-to-r {roleColor} p-6 rounded-3xl inline-block mb-6">
    <Icon className="w-16 h-16 text-white" />
  </div>
  
  {/* Content */}
  <h3 className="text-3xl font-bold text-gray-800 mb-3">{title}</h3>
  <p className="text-xl text-gray-600">{subtitle}</p>
</div>
```

### **Button Patterns**

#### **Primary Action Button**
```tsx
<button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-6 rounded-2xl text-2xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3 min-h-20">
  <Icon className="w-8 h-8" />
  <span>Action Text</span>
</button>
```

#### **Secondary Action Button**
```tsx
<button className="w-full bg-gray-500 hover:bg-gray-600 text-white py-6 rounded-2xl text-2xl font-semibold transition-all duration-200 min-h-20">
  Secondary Action
</button>
```

#### **Keyboard Key Button**
```tsx
<button className="bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-300 rounded-xl p-4 text-xl font-semibold transition-all duration-150 min-h-touch flex items-center justify-center shadow-sm hover:shadow-md text-gray-800">
  {key}
</button>
```

### **Input Field Pattern**
```tsx
<div className="relative">
  <input 
    className="w-full px-8 py-6 text-2xl bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:border-transparent transition-all"
    placeholder="Large, clear placeholder"
  />
  {/* Optional action button */}
  <button className="absolute right-6 top-1/2 transform -translate-y-1/2">
    <Icon className="w-8 h-8" />
  </button>
</div>
```

---

## 🎭 **Animation & Transitions**

### **Standard Transitions**
```css
transition-all duration-200    /* Buttons, hover effects */
transition-all duration-300    /* Cards, larger elements */
transition-all duration-150    /* Keyboard keys (fast response) */
transition-transform duration-300  /* Scale effects */
```

### **Hover Effects**
```css
/* Cards */
hover:shadow-3xl transform hover:scale-105

/* Buttons */
hover:from-blue-700 hover:to-purple-700

/* Icons within cards */
group-hover:scale-110
```

### **Focus States**
```css
focus:outline-none focus:ring-4 focus:ring-blue-500 focus:border-transparent
```

---

## 📱 **Responsive Design**

### **Breakpoint Strategy**
```css
/* Mobile-first approach */
grid-cols-1                    /* Default: Single column */
md:grid-cols-2                 /* Medium: 2 columns */
lg:grid-cols-3                 /* Large: 3 columns */

/* Container widths */
max-w-md     /* Single card width */
max-w-4xl    /* Two-card container */
max-w-6xl    /* Three-card container */
max-w-7xl    /* Full-width container */
```

### **Layout Patterns**
```tsx
{/* Responsive grid */}
<div className={`grid gap-8 ${
  items.length === 2 
    ? 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto' 
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
}`}>
```

---

## 🎨 **Visual Hierarchy**

### **Z-Index Scale**
```css
z-10    /* Floating UI elements (mode toggle, indicator) */
z-20    /* Modals */
z-30    /* Tooltips */
z-40    /* Dropdown menus */
z-50    /* Notifications */
```

### **Shadow Scale**
```css
shadow-sm      /* Subtle elevation */
shadow-2xl     /* Card elevation */
shadow-3xl     /* Hover elevation */
shadow-lg      /* Button elevation */
```

### **Border Radius Scale**
```css
rounded-xl     /* Buttons, inputs (12px) */
rounded-2xl    /* Cards, containers (16px) */
rounded-3xl    /* Large cards, main containers (24px) */
rounded-full   /* Indicators, badges */
```

---

## 🔧 **Component Architecture**

### **File Organization**
```
src/components/
├── Auth/
│   └── LoginForm.tsx
├── Layout/
│   ├── Header.tsx
│   ├── Layout.tsx
│   └── Sidebar.tsx
├── VirtualKeyboard.tsx    # Shared components at root
└── [FeatureComponents]/   # Feature-specific folders
```

### **Component Props Pattern**
```tsx
interface ComponentProps {
  // Required props first
  onAction: (data: Type) => void;
  
  // Optional configuration
  variant?: 'default' | 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  
  // Styling overrides
  className?: string;
  
  // Content
  children?: React.ReactNode;
}
```

### **State Management Pattern**
```tsx
// Local state for UI concerns
const [isVisible, setIsVisible] = useState(false);
const [inputValue, setInputValue] = useState('');

// Context for global app state
const { user, login, logout } = useAuth();
const { cart, addItem, removeItem } = usePOS();
```

---

## 🎯 **POS-Specific Guidelines**

### **Employee Role Visualization**
- **Always** use role-based color coding
- **Display** role prominently with employee name
- **Maintain** visual hierarchy: Name > Role > Employee Number

### **Touch Interface Requirements**
- **Minimum** 60px touch targets
- **Prefer** buttons over dropdowns
- **Large** text for readability (minimum 18px)
- **High** contrast for visibility

### **Error Handling**
```tsx
{error && (
  <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6">
    <p className="text-red-700 text-xl font-medium">{error}</p>
  </div>
)}
```

### **Loading States**
```tsx
{isLoading ? (
  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
) : (
  <span>Button Text</span>
)}
```

---

## 🌟 **Best Practices**

### **Accessibility**
- ✅ **Semantic HTML** elements
- ✅ **Proper ARIA labels** for screen readers
- ✅ **High contrast** ratios (4.5:1 minimum)
- ✅ **Keyboard navigation** support
- ✅ **Focus indicators** visible

### **Performance**
- ✅ **Lazy load** heavy components
- ✅ **Debounce** search inputs
- ✅ **Optimize** images for different screen densities
- ✅ **Minimize** re-renders with React.memo

### **Code Quality**
- ✅ **TypeScript** for all components
- ✅ **Consistent** naming conventions
- ✅ **Reusable** component patterns
- ✅ **Clean** prop interfaces

---

## 🚫 **Design Don'ts**

### **Avoid These Patterns**
- ❌ **Small touch targets** (< 44px)
- ❌ **Dropdown menus** in touch interfaces
- ❌ **Low contrast** text combinations
- ❌ **Complex navigation** hierarchies
- ❌ **Tiny fonts** (< 16px on mobile)
- ❌ **Multiple primary** actions on one screen
- ❌ **Inconsistent** spacing scales

### **Touch Interface Anti-Patterns**
- ❌ **Hover-dependent** interactions
- ❌ **Right-click** context menus
- ❌ **Keyboard-only** shortcuts
- ❌ **Precise mouse** movements required

---

## 🔄 **Future Considerations**

### **Planned Enhancements**
- 🔮 **Dark mode** support with role-based theming
- 🔮 **Accessibility** improvements (voice commands)
- 🔮 **Multi-language** support
- 🔮 **Custom branding** for different retailers
- 🔮 **Advanced animations** for feedback

### **Component Extensions**
- 🔮 **NumericKeyboard** variant for price entry
- 🔮 **ProductGrid** with touch-optimized layout
- 🔮 **Receipt** printing components
- 🔮 **Payment** processing interfaces

---

## 📋 **Checklist for New Components**

Before adding any new component, ensure:

- [ ] **Touch targets** meet minimum 60px requirement
- [ ] **Color scheme** follows role-based or functional patterns
- [ ] **Typography** uses established scale
- [ ] **Spacing** follows consistent gap system
- [ ] **Animations** use standard transition timings
- [ ] **Error states** are properly designed
- [ ] **Loading states** are implemented
- [ ] **TypeScript** interfaces are defined
- [ ] **Accessibility** requirements are met
- [ ] **Responsive** behavior is tested

---

*This style guide should be referenced for all future development to maintain consistency and quality across the POS system.* 