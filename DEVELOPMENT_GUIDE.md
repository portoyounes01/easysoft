# POS System Development Guide

## 🏗️ **Architecture Overview**

This POS system follows a **component-based architecture** built with React, TypeScript, and Tailwind CSS, optimized for touch-screen retail environments.

---

## 📁 **Project Structure**

```
project/
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   └── LoginForm.tsx
│   │   ├── Layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Layout.tsx
│   │   │   └── Sidebar.tsx
│   │   └── VirtualKeyboard.tsx          # Shared components
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── POSContext.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Employees.tsx
│   │   ├── POS.tsx
│   │   └── Products.tsx
│   ├── types/
│   │   └── index.ts                     # All TypeScript interfaces
│   └── utils/                           # Helper functions
├── STYLE_GUIDE.md                       # Design system reference
├── DEVELOPMENT_GUIDE.md                 # This file
├── TODO.md                             # Future tasks
├── IN_PROGRESS.md                      # Current work
└── DONE.md                             # Completed features
```

---

## 🎯 **TypeScript Conventions**

### **Interface Naming**
```typescript
// Entity interfaces - PascalCase
interface Employee { }
interface Product { }
interface Transaction { }

// Props interfaces - ComponentNameProps
interface LoginFormProps { }
interface VirtualKeyboardProps { }

// Context interfaces - ContextNameType
interface AuthContextType { }
interface POSContextType { }
```

### **Type Definitions**
```typescript
// Use Pick for partial interfaces
type EmployeeBasic = Pick<Employee, 'employeeNumber' | 'name' | 'role'>;

// Use unions for controlled values
type EmployeeRole = 'admin' | 'manager' | 'cashier';
type ButtonVariant = 'default' | 'primary' | 'secondary';

// Use optional properties wisely
interface ComponentProps {
  required: string;
  optional?: boolean;
  callback: (data: Type) => void;
}
```

---

## 🧩 **Component Patterns**

### **Functional Component Structure**
```typescript
import React, { useState, useEffect } from 'react';
import { Icon } from 'lucide-react';
import { useContext } from '../contexts/ContextName';

interface ComponentProps {
  // Props definition
}

const ComponentName: React.FC<ComponentProps> = ({ 
  prop1, 
  prop2, 
  className = '' 
}) => {
  // 1. Hooks (useState, useEffect, useContext)
  const [localState, setLocalState] = useState('');
  const { globalState, actions } = useContext();
  
  // 2. Event handlers
  const handleAction = (data: Type) => {
    // Handler logic
  };
  
  // 3. Computed values
  const computedValue = useMemo(() => {
    return expensiveOperation(localState);
  }, [localState]);
  
  // 4. Effects
  useEffect(() => {
    // Side effects
  }, [dependencies]);
  
  // 5. Render
  return (
    <div className={`base-classes ${className}`}>
      {/* Component JSX */}
    </div>
  );
};

export default ComponentName;
```

### **Reusable Component Pattern**
```typescript
// Create flexible, reusable components
interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'default',
  size = 'medium',
  disabled = false,
  className = '',
  icon
}) => {
  const baseClasses = 'font-semibold transition-all duration-200 flex items-center justify-center';
  const variantClasses = {
    default: 'bg-gray-500 hover:bg-gray-600 text-white',
    primary: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white',
    secondary: 'bg-white hover:bg-gray-100 text-gray-800 border border-gray-300'
  };
  const sizeClasses = {
    small: 'px-4 py-2 text-sm min-h-[44px]',
    medium: 'px-6 py-4 text-lg min-h-[60px]',
    large: 'px-8 py-6 text-2xl min-h-[80px]'
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};
```

---

## 🔄 **State Management**

### **Local State Guidelines**
```typescript
// Use useState for component-specific state
const [isVisible, setIsVisible] = useState(false);
const [inputValue, setInputValue] = useState('');
const [error, setError] = useState<string | null>(null);

// Use useReducer for complex state logic
interface State {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: Data | null;
  error: string | null;
}

type Action = 
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: Data }
  | { type: 'FETCH_ERROR'; payload: string };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, status: 'loading', error: null };
    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.payload, error: null };
    case 'FETCH_ERROR':
      return { ...state, status: 'error', error: action.payload };
    default:
      return state;
  }
};
```

### **Context Pattern**
```typescript
// AuthContext.tsx
interface AuthState {
  user: Employee | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (employeeNumber: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  
  const login = async (employeeNumber: string, password: string) => {
    // Login implementation
  };
  
  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

---

## 🎨 **Styling Conventions**

### **Tailwind CSS Guidelines**
```typescript
// Component-specific styles
const componentStyles = {
  container: "min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900",
  card: "bg-white rounded-3xl shadow-2xl p-8",
  button: "w-full py-6 rounded-2xl text-2xl font-semibold transition-all duration-200",
  input: "w-full px-8 py-6 text-2xl bg-gray-50 border-2 border-gray-200 rounded-2xl"
};

// Conditional styling
const getButtonClasses = (variant: string, disabled: boolean) => {
  const baseClasses = componentStyles.button;
  const variantClasses = variant === 'primary' 
    ? 'bg-gradient-to-r from-blue-600 to-purple-600' 
    : 'bg-gray-500';
  const stateClasses = disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90';
  
  return `${baseClasses} ${variantClasses} ${stateClasses}`;
};
```

### **Dynamic Class Names**
```typescript
// Use template literals for complex conditional classes
const cardClasses = `
  bg-white rounded-3xl shadow-2xl p-8 
  transform transition-all duration-300
  ${isSelected ? 'scale-105 ring-4 ring-blue-500' : 'hover:scale-102'}
  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
`;

// For multiple conditions, use objects
const getEmployeeCardClasses = (role: string, isSelected: boolean) => {
  const baseClasses = "bg-white rounded-3xl p-8 shadow-2xl transition-all duration-300";
  const roleClasses = {
    admin: "border-red-500",
    manager: "border-orange-500", 
    cashier: "border-blue-500"
  };
  const selectedClasses = isSelected ? "scale-105 ring-4 ring-blue-500" : "hover:scale-102";
  
  return `${baseClasses} ${roleClasses[role]} ${selectedClasses}`;
};
```

---

## 🔧 **Event Handling**

### **Touch Event Patterns**
```typescript
// Handle both touch and mouse events
const handleInteraction = (e: React.TouchEvent | React.MouseEvent) => {
  e.preventDefault();
  // Handle interaction
};

// Touch-specific handlers
const handleTouchStart = (e: React.TouchEvent) => {
  setIsPressed(true);
};

const handleTouchEnd = (e: React.TouchEvent) => {
  setIsPressed(false);
  onClick();
};

// In JSX
<button
  onMouseDown={() => setIsPressed(true)}
  onMouseUp={() => setIsPressed(false)}
  onTouchStart={handleTouchStart}
  onTouchEnd={handleTouchEnd}
  onClick={onClick}
>
```

### **Form Handling**
```typescript
const LoginForm: React.FC = () => {
  const [formData, setFormData] = useState({
    employeeNumber: '',
    password: ''
  });
  
  const handleInputChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.employeeNumber}
        onChange={handleInputChange('employeeNumber')}
      />
    </form>
  );
};
```

---

## 🛠️ **Custom Hooks**

### **Reusable Logic Patterns**
```typescript
// useLocalStorage hook
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue] as const;
}

// useDebounce hook
function useDebounce<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

---

## 🧪 **Error Handling**

### **Error Boundary Pattern**
```typescript
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-4">Please refresh the page or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### **Async Error Handling**
```typescript
const useAsyncOperation = () => {
  const [state, setState] = useState({
    data: null,
    loading: false,
    error: null
  });

  const execute = async (asyncFunction: () => Promise<any>) => {
    setState({ data: null, loading: true, error: null });
    
    try {
      const result = await asyncFunction();
      setState({ data: result, loading: false, error: null });
    } catch (error) {
      setState({ 
        data: null, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  return { ...state, execute };
};
```

---

## 📱 **Performance Optimizations**

### **React.memo Usage**
```typescript
// Memoize components that receive the same props frequently
const ExpensiveComponent = React.memo<ComponentProps>(({ data, onAction }) => {
  return (
    <div>
      {/* Expensive rendering logic */}
    </div>
  );
});

// Custom comparison function for complex props
const areEqual = (prevProps: Props, nextProps: Props) => {
  return prevProps.data.id === nextProps.data.id &&
         prevProps.isSelected === nextProps.isSelected;
};

const OptimizedComponent = React.memo(Component, areEqual);
```

### **useMemo and useCallback**
```typescript
const Component: React.FC<Props> = ({ items, onSelect }) => {
  // Memoize expensive calculations
  const expensiveValue = useMemo(() => {
    return items.reduce((sum, item) => sum + item.value, 0);
  }, [items]);

  // Memoize event handlers to prevent unnecessary re-renders
  const handleSelect = useCallback((id: string) => {
    onSelect(id);
  }, [onSelect]);

  return (
    <div>
      {items.map(item => (
        <Item key={item.id} data={item} onSelect={handleSelect} />
      ))}
    </div>
  );
};
```

---

## 🔍 **Testing Strategies**

### **Component Testing**
```typescript
// Example test structure
import { render, screen, fireEvent } from '@testing-library/react';
import { VirtualKeyboard } from '../VirtualKeyboard';

describe('VirtualKeyboard', () => {
  const mockProps = {
    onKeyPress: jest.fn(),
    onBackspace: jest.fn(),
    onClear: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all letter keys', () => {
    render(<VirtualKeyboard {...mockProps} />);
    
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    // ... more assertions
  });

  it('calls onKeyPress when letter key is clicked', () => {
    render(<VirtualKeyboard {...mockProps} />);
    
    fireEvent.click(screen.getByText('Q'));
    expect(mockProps.onKeyPress).toHaveBeenCalledWith('q');
  });

  it('toggles caps lock correctly', () => {
    render(<VirtualKeyboard {...mockProps} />);
    
    const capsButton = screen.getByText('CAPS');
    fireEvent.click(capsButton);
    
    expect(screen.getByText('🔒 CAPS LOCK ON')).toBeInTheDocument();
  });
});
```

---

## 📋 **Code Review Checklist**

### **Before Submitting**
- [ ] **TypeScript** - No type errors or `any` types
- [ ] **Performance** - Unnecessary re-renders avoided
- [ ] **Accessibility** - ARIA labels and keyboard navigation
- [ ] **Touch Optimization** - Minimum 60px touch targets
- [ ] **Error Handling** - Proper error boundaries and validation
- [ ] **Styling** - Follows established design system
- [ ] **Testing** - Unit tests for new functionality
- [ ] **Documentation** - Props interfaces documented

### **Code Quality Standards**
- [ ] **Naming** - Clear, descriptive variable and function names
- [ ] **Structure** - Logical component organization
- [ ] **Reusability** - Components can be used in multiple contexts
- [ ] **Maintainability** - Easy to understand and modify
- [ ] **Consistency** - Follows established patterns

---

## 🚀 **Development Workflow**

### **Feature Development Process**
1. **Design Review** - Check against style guide
2. **Component Planning** - Identify reusable patterns
3. **Implementation** - Follow established conventions
4. **Testing** - Unit and integration tests
5. **Code Review** - Peer review against checklist
6. **Documentation** - Update relevant guides

### **Git Conventions**
```bash
# Commit message format
feat: add virtual keyboard component
fix: resolve touch target sizing issue
docs: update style guide with new patterns
refactor: optimize login form performance
test: add keyboard component tests
```

---

*This development guide should be used alongside the Style Guide to ensure both design consistency and code quality across the POS system.* 