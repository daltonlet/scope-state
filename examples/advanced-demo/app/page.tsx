'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { $local, monitorAPI, optimizeMemoryUsage, useScope } from '../../../src/index';
import { $ } from '../store/store';

// Render counter hook for demonstrating selective rendering
function useRenderCounter(componentName: string) {
  const renderCount = useRef(0);
  renderCount.current += 1;

  useEffect(() => {
    console.log(`${componentName} rendered ${renderCount.current} times`);
  });

  return renderCount.current;
}

// User Profile Demo Component
function UserProfileDemo() {
  const renderCount = useRenderCounter('UserProfileDemo');
  const user = useScope(() => $.user);
  const [newTag, setNewTag] = useState('');

  const updateName = () => {
    const names = ['John Doe', 'Jane Smith', 'Alice Johnson', 'Bob Wilson'];
    const currentName = user.name;
    const newName = names.find(name => name !== currentName) || names[0];
    $.user.name = newName;

    // Update demo stats
    $.demo.$merge({
      lastAction: `Updated name to ${newName}`,
      timestamp: Date.now()
    });
  };

  const toggleTheme = () => {
    $.user.preferences.$update('theme', (current: any) =>
      current === 'light' ? 'dark' : 'light'
    );

    $.demo.$merge({
      lastAction: `Toggled theme to ${user.preferences.theme}`,
      timestamp: Date.now()
    });
  };

  const addTag = () => {
    if (newTag.trim()) {
      $.user.preferences.tags.push(newTag.trim());
      setNewTag('');

      $.demo.$merge({
        lastAction: `Added tag: ${newTag}`,
        timestamp: Date.now()
      });
    }
  };

  const removeTag = (index: number) => {
    const removedTag = user.preferences.tags[index];
    $.user.preferences.tags.splice(index, 1);

    $.demo.$merge({
      lastAction: `Removed tag: ${removedTag}`,
      timestamp: Date.now()
    });
  };

  const resetUser = () => {
    $.user.$reset();
    $.demo.$merge({
      lastAction: 'Reset user to initial state',
      timestamp: Date.now()
    });
  };

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="demo-section" suppressHydrationWarning>
        <h2>
          User Profile Demo
          <span className="render-counter optimized">
            Renders: {renderCount}
          </span>
        </h2>

        <div>
          <h3>Basic Info</h3>
          <p><strong>Name:</strong> {user.name}</p>
          <p><strong>Email:</strong> {user.email}</p>
          <p suppressHydrationWarning><strong>Theme:</strong> {user.preferences.theme}</p>

          <button className="button" onClick={updateName}>
            Change Name
          </button>
          <button className="button" onClick={toggleTheme}>
            Toggle Theme
          </button>
          <button className="button danger" onClick={resetUser}>
            Reset User
          </button>
        </div>

        <div className="method-demo">
          <h4>Tags Management ($merge, push, splice)</h4>
          <div>
            {user.preferences.tags.map((tag: any, index: number) => (
              <span
                key={index}
                className="array-item"
                style={{ display: 'inline-block', margin: '4px' }}
              >
                {tag}
                <button
                  className="button danger"
                  style={{ marginLeft: '8px', padding: '2px 6px' }}
                  onClick={() => removeTag(index)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ marginTop: '12px' }}>
            <input
              className="input"
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add new tag"
              onKeyPress={(e) => e.key === 'Enter' && addTag()}
            />
            <button className="button success" onClick={addTag}>
              Add Tag
            </button>
          </div>
        </div>

        <div className="json-output">
          {JSON.stringify(user.raw(), null, 2)}
        </div>
      </div>
    </Suspense>
  );
}

// Todo List Demo Component
function TodoListDemo() {
  const renderCount = useRenderCounter('TodoListDemo');
  const todos = useScope(() => $.todos);
  const [newTodo, setNewTodo] = useState('');

  const addTodo = () => {
    if (newTodo.trim()) {
      const newId = Math.max(...todos.map((t: any) => t.id), 0) + 1;
      $.todos.push({
        id: newId,
        text: newTodo.trim(),
        completed: false,
        priority: 'medium'
      });
      setNewTodo('');

      $.counters.$update('todos', (count: any) => count + 1);
      $.demo.$merge({
        lastAction: `Added todo: ${newTodo}`,
        timestamp: Date.now()
      });
    }
  };

  const toggleTodo = (index: number) => {
    const todo = todos[index];
    $.todos[index].completed = !todo.completed;

    $.demo.$merge({
      lastAction: `Toggled todo: ${todo.text}`,
      timestamp: Date.now()
    });
  };

  const deleteTodo = (index: number) => {
    const todo = todos[index];
    $.todos.splice(index, 1);

    $.demo.$merge({
      lastAction: `Deleted todo: ${todo?.text}`,
      timestamp: Date.now()
    });
  };

  const clearCompleted = () => {
    const completed = todos.filter((t: any) => t.completed);
    // Remove completed todos one by one
    for (let i = todos.length - 1; i >= 0; i--) {
      if (todos[i].completed) {
        $.todos.splice(i, 1);
      }
    }

    $.demo.$merge({
      lastAction: `Cleared ${completed.length} completed todos`,
      timestamp: Date.now()
    });
  };

  const resetTodos = () => {
    todos.$reset();
    $.demo.$merge({
      lastAction: 'Reset todos to initial state',
      timestamp: Date.now()
    });
  };

  return (
    <div className="demo-section">
      <h2>
        Todo List Demo
        <span className="render-counter optimized">
          Renders: {renderCount}
        </span>
      </h2>

      <div className="method-demo">
        <h4>Add New Todo (push method)</h4>
        <input
          className="input"
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Enter new todo"
          onKeyPress={(e) => e.key === 'Enter' && addTodo()}
        />
        <button className="button success" onClick={addTodo}>
          Add Todo
        </button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <button className="button" onClick={clearCompleted}>
          Clear Completed
        </button>
        <button className="button danger" onClick={resetTodos}>
          Reset Todos
        </button>
      </div>

      <div>
        {todos.map((todo: any, index: number) => (
          <div key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(index)}
                style={{ marginRight: '12px' }}
              />
              <span>{todo.text}</span>
              <span
                style={{
                  marginLeft: '12px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  background: todo.priority === 'high' ? '#fed7d7' :
                    todo.priority === 'medium' ? '#fef5e7' : '#e6fffa'
                }}
              >
                {todo.priority}
              </span>
            </div>
            <button
              className="button danger"
              onClick={() => deleteTodo(index)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Counter Demo Component
function CounterDemo() {
  const renderCount = useRenderCounter('CounterDemo');
  const counters = useScope(() => $.counters);

  const incrementGlobal = () => {
    $.counters.$update('global', (count: any) => count + 1);
    $.demo.$merge({
      lastAction: 'Incremented global counter',
      timestamp: Date.now()
    });
  };

  const incrementUser = () => {
    $.counters.$update('user', (count: any) => count + 1);
    $.demo.$merge({
      lastAction: 'Incremented user counter',
      timestamp: Date.now()
    });
  };

  const resetCounters = () => {
    $.counters.$reset();
    $.demo.$merge({
      lastAction: 'Reset all counters',
      timestamp: Date.now()
    });
  };

  const massUpdate = () => {
    $.counters.$merge({
      global: counters.global + 10,
      user: counters.user + 5,
      todos: counters.todos + 3
    });
    $.demo.$merge({
      lastAction: 'Mass updated all counters',
      timestamp: Date.now()
    });
  };

  return (
    <div className="demo-section">
      <h2>
        Counter Demo
        <span className="render-counter optimized">
          Renders: {renderCount}
        </span>
      </h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{counters.global}</div>
          <div className="stat-label">Global</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{counters.user}</div>
          <div className="stat-label">User</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{counters.todos}</div>
          <div className="stat-label">Todos</div>
        </div>
      </div>

      <div className="method-demo">
        <h4>Counter Actions ($update, $merge)</h4>
        <button className="button" onClick={incrementGlobal}>
          +1 Global
        </button>
        <button className="button" onClick={incrementUser}>
          +1 User
        </button>
        <button className="button" onClick={massUpdate}>
          Mass Update
        </button>
        <button className="button danger" onClick={resetCounters}>
          Reset All
        </button>
      </div>
    </div>
  );
}

// Selective Rendering Demo
function SelectiveRenderingDemo() {
  const renderCount = useRenderCounter('SelectiveRenderingDemo');

  // Only subscribe to demo.lastAction - won't re-render for other changes
  const lastAction = useScope(() => $.demo.lastAction);
  const timestamp = useScope(() => $.demo.timestamp);

  return (
    <div className="demo-section comparison-section">
      <h2>
        Selective Rendering Demo
        <span className="render-counter optimized">
          Renders: {renderCount}
        </span>
      </h2>

      <p>
        This component only subscribes to <code>demo.lastAction</code> and <code>demo.timestamp</code>.
        Notice how it doesn&apos;t re-render when you modify user data, todos, or counters!
      </p>

      <div className="comparison-grid">
        <div className="comparison-card">
          <h3>Last Action</h3>
          <p><strong>{lastAction}</strong></p>
          <p style={{ fontSize: '0.9rem', color: '#666' }} suppressHydrationWarning>
            {new Date(timestamp).toLocaleTimeString()}
          </p>
        </div>

        <div className="comparison-card">
          <h3>Render Efficiency</h3>
          <p>
            This component has rendered <strong>{renderCount}</strong> times.
            Compare this to components that subscribe to frequently changing data.
          </p>
        </div>
      </div>
    </div>
  );
}

// Monitoring Dashboard
function MonitoringDashboard() {
  const renderCount = useRenderCounter('MonitoringDashboard');
  const [stats, setStats] = useState<any>(null);
  const [leakReport, setLeakReport] = useState<any>(null);

  const refreshStats = () => {
    const currentStats = monitorAPI.getStats();
    setStats(currentStats);

    $.demo.$merge({
      lastAction: 'Refreshed monitoring stats',
      timestamp: Date.now()
    });
  };

  const performLeakCheck = () => {
    const report = monitorAPI.checkForLeaks();
    setLeakReport(report);

    $.demo.$merge({
      lastAction: 'Performed leak detection check',
      timestamp: Date.now()
    });
  };

  const optimizeMemory = () => {
    const result = optimizeMemoryUsage();
    console.log('Memory optimization result:', result);

    $.demo.$merge({
      lastAction: 'Optimized memory usage',
      timestamp: Date.now()
    });
  };

  useEffect(() => {
    refreshStats();
  }, []);

  return (
    <div className="demo-section monitoring-section">
      <h2>
        Monitoring Dashboard
        <span className="render-counter optimized">
          Renders: {renderCount}
        </span>
      </h2>

      <div style={{ marginBottom: '20px' }}>
        <button className="button" onClick={refreshStats}>
          Refresh Stats
        </button>
        <button className="button" onClick={performLeakCheck}>
          Check for Leaks
        </button>
        <button className="button" onClick={optimizeMemory}>
          Optimize Memory
        </button>
      </div>

      {stats && (
        <div>
          <h3>Performance Stats</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.activeSubscriptions}</div>
              <div className="stat-label">Active Subscriptions</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalProxiesCreated}</div>
              <div className="stat-label">Proxies Created</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.cacheHitRatio?.toFixed(2) || '0.00'}</div>
              <div className="stat-label">Cache Hit Ratio</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{Object.keys(stats.pathSubscriptionCounts || {}).length}</div>
              <div className="stat-label">Tracked Paths</div>
            </div>
          </div>

          <h4>Detailed Stats</h4>
          <div className="json-output">
            {JSON.stringify(stats, null, 2)}
          </div>
        </div>
      )}

      {leakReport && (
        <div>
          <h3>Leak Detection Report</h3>
          <div className={`stat-card ${leakReport.orphanedListeners === 0 ? 'success' : 'warning'}`}>
            <div className="stat-value" style={{
              color: leakReport.orphanedListeners === 0 ? '#2f855a' : '#c53030'
            }}>
              {leakReport.orphanedListeners}
            </div>
            <div className="stat-label">Potential Leaks</div>
          </div>

          <div className="json-output">
            {JSON.stringify(leakReport, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Page Component
export default function HomePage() {
  const renderCount = useRenderCounter('HomePage');

  const localState = $local

  return (
    <div className="app">
      <header className="header">
        <h1>🎯 Scope State Advanced Demo</h1>
        <p>
          Interactive showcase of all features and selective rendering
          <span className="render-counter">
            App Renders: {renderCount}
          </span>
        </p>
      </header>

      <div className="demo-grid">
        <UserProfileDemo />
        <TodoListDemo />
        <CounterDemo />
        <SelectiveRenderingDemo />
        <MonitoringDashboard />
      </div>

      <div style={{
        textAlign: 'center',
        color: 'white',
        marginTop: '40px',
        fontSize: '0.9rem',
        opacity: 0.8
      }}>
        <p>
          Open your browser&apos;s developer console to see detailed logging and performance metrics.
          Try interacting with different components and notice how only relevant components re-render!
        </p>
      </div>
    </div>
  );
} 