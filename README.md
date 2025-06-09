# Scope State
_The simplest global state system for React._

A tiny reactive state manager with global reach and local clarity. Built for modern React. No stale bugs. No mental gymnastics. Full support for storage persistence, auto-optimization, and more.

Built for developers who hate Redux and love clarity.



## Why Scope State?

Scope State gives you **global reactive state** with:
- **Zero reducers, zero contexts**
- **Zero boilerplate**
- **Zero spreads, zero selectors**
- **No need for `setState`**
- And most importantly — **no stale value bugs**

Just write:

```ts
import { $, useScope } from 'scope-state';

export const ProfilePage = () => {
  const name = useScope(() => $.user.name);
  return <h1>{name}</h1>
}
```

That's it. It tracks dependencies automatically and re-renders only what changed.



## What Makes It Different?

- **Fully reactive** — inspired by proxies, not reducers
- **Intuitive reads and writes** — no `.get()` or `.set()` syntax hell
- **Mutate like it's a regular object or ref** — works with objects, arrays, numbers, everything
- **Fine-grained tracking** — no wasted renders
- **Built-in debug tools** 
- **Feels like magic**
- **Read and set states *independently* —** outside of functional components or custom hooks



## Getting Started

### Installation

```bash
npm install scope-state
```

### Quick Start

```tsx
// store.ts
import { configure } from 'scope-state';
export const $ = configure({
  initialState: {
    user: { name: 'John', age: 30 }
  }
});
```

```tsx
// UserProfile.tsx
import { useScope } from 'scope-state';
import { $ } from './store';

export const UserProfile = () => {
  const name = useScope(() => $.user.name);
  return <h1>{name}</h1>;
}
```

### Basic Usage

```tsx
import { useScope, configure } from 'scope-state';

// RECOMMENDED: Configure with your initial state
// It's best to configure your initial store in a separate file.
// The usage of the dollar sign ($) is optional; just a way to keep it brief
// and easy to identify.

export const $ = configure({
  initialState: {
    user: { name: 'John', age: 30 },
    todos: [],
    theme: 'dark'
  }
});

// Use in components
import { useScope } from 'scope-state';

export const UserProfileComponent = () => {

  const user = useScope(() => $.user);
  
  return (
    <div>
      <h1>{user.name}</h1>
      <button 
        onClick={() => {
          user.age += 1
        }}
      >
          Age: {user.age}
      </button>
    </div>
  );
}

const TodoList = () => {
  const todos = useScope(() => $.todos);
  
  const addTodo = () => {
    $.todos.push({ id: Date.now(), text: 'New todo', done: false });
  };
  
  return (
    <div>
      {todos.map(todo => (
        <div key={todo.id}>{todo.text}</div>
      ))}
      <button onClick={addTodo}>Add Todo</button>
    </div>
  );
}
```

## 📚 API Reference

### Core Functions

#### `useScope(selector)`
Subscribe to reactive state changes.

```tsx
// Subscribe to entire object
const user = useScope(() => $.user);

// Subscribe to specific property
const userName = useScope(() => $.user.name);

// Subscribe to computed value
const isAdmin = useScope(() => $.user.role === 'admin');

// Subscribe to array
const todos = useScope(() => $.todos);
```

#### `configure(options)`
Configure Scope State with custom settings.

```tsx
import { configure, presets } from 'scope-state';

// Use a preset
configure(presets.production());

// Custom configuration
const $ = configure({
  initialState: { /* your state */ },
  monitoring: { enabled: true },
  proxy: { maxDepth: 3 }
});

// Then access any item in your state by scoping it using the main hook:
const restaurants = useScope(() => $.restaurants || []) // optional fallback
```

---

### Object Methods

All objects in the store have these reactive methods:

#### `$merge(newProps)`
Merge new properties without removing existing ones.

```tsx
$.user.$merge({ name: 'John' }); // Updates only name
```

#### `$set(newProps)`
Replace object with new properties.

```tsx
$.user.$set({ name: 'John', age: 25 }); // Replaces entire user object
```

#### `raw()`
Get plain, serializable JavaScript object without any function references (the reactivity methods removed).

```tsx
const plainUser = $.user.raw(); 
```
_This is helpful when you need to serialize the state for storage, API calls, or debugging. Otherwise, it's not necessary._

---

### Array Methods

Arrays have enhanced methods that trigger reactivity:

```tsx
todos.push({ id: 1, text: 'Buy milk' });  // This will trigger a re-render

todos.splice(0, 1);                       // This will trigger a re-render

$.todos = [/* new array */]               // You can also directly assign a new array to the property in the global state itself ($).
```

### Utility Functions

Create reactive local state (not global).

```tsx
import { useLocal } from 'scope-state';

function MyComponent() {
  const localState = useLocal({ count: 0 });
  
  return (
    <button onClick={() => localState.count + 1}>
      Count: {localState.count}
    </button>
  );
}
```



## Configuration



### Presets

```tsx
import { configure, presets } from 'scope-state';

// Development: Enhanced debugging
configure(presets.development());

// Production: Optimized performance
configure(presets.production());

// Minimal: Memory-constrained environments
configure(presets.minimal());

// Full-featured: All features enabled
configure(presets.full());
```



### Custom Configuration

```tsx
configure({
  initialState: {
    // Your app's initial state
  },
  proxy: {
    maxDepth: 5, // How deep to proxy objects
    smartArrayTracking: true, // Optimize array operations
  },
  monitoring: {
    enabled: true, // Enable debug logging
    verboseLogging: false, // Detailed logs
    autoLeakDetection: true, // Detect memory leaks
  },
  persistence: {
    enabled: true, // Enable state persistence
    paths: ['user', 'settings.theme'], // Which paths to persist (leave as undefined to persist all paths)
  }
});
```



## Philosophy

React's core primitives like `useState`, `useReducer`, and `useContext` work well for many use cases.

But when your app grows in complexity…
- deeply nested objects,
- shared state across pages,
- state persistence,
- or fine-grained reactivity,

suddenly you're spending time wiring reducers, spreading props, memoizing selectors, and debugging re-renders.

Scope State simplifies that.

You write and read state _directly_, just like a `ref` or a signal, but with full reactivity, automatic tracking, and global accessibility.


This library was built out of frustration with every other state system:
- **Redux** is too bloated
- **Recoil** is too verbose  
- **Zustand** still forces manual updates
- **Legend State** is performant (and deserves significant respect) but has a higher learning curve and confusing API. It's simply ahead of its time.

The mental model is simple: write and read directly. Like `useRef`, but global, reactive, and tracked.

## Best Practices

### 1. Keep Selectors Simple

```tsx
// ✅ Good
const name = useScope(() => $.user.name);

// ❌ Avoid complex computations in selectors
const expensiveData = useScope(() => $.data.map(/* heavy computation */));

// Instead...
const data = useScope(() => $.data);
const expensiveCalculation = useMemo(() => data.map(/* heavy computation */), [data])
```



### 2. Use Direct Assignment & Flexible Methods for Updates

```tsx
// Option 1: Direct assignment
$.user.name = "John";

$.todos.push({ title: "Do Laundry", date: new Date().toISOString() })

// Option 2: Shallow merge a new value without changing existing properties
$.user.$merge({ name: 'John' });

// Option 3: Use the updater function [NEW!]
$.user.$update("age", (age) => age + 1);

```



### 3. Configure Persistence (Optional)

```tsx
// ✅ Configure before your app starts
configure(presets.production());

function App() {
  // Your app components
}
```


## Created by Dalton Letorney

If you like this, feel free to star the repo! If you love it, use it in production. If it breaks, open a PR so we can make this even more epic.


---


**Scope State is minimal by design** — the goal is not to reinvent React, but to make it finally feel clean again.


## License

MIT © Dalton Letorney