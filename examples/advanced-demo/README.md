# 🎯 Scope State Advanced Demo

This interactive demo showcases all the advanced features of Scope State and demonstrates the power of selective rendering.

## Features Demonstrated

### Core Methods
- **$merge**: Merge properties into objects without removing existing ones
- **$set**: Completely replace object properties  
- **$update**: Update properties using updater functions
- **$reset**: Reset objects to their initial state
- **push/splice**: Enhanced array methods with reactivity
- **raw()**: Get plain JavaScript objects without proxies

### Selective Rendering
- Components only re-render when their specific data changes
- Notice how the "Selective Rendering Demo" component has minimal renders
- Compare render counts between different components

### Monitoring & Performance
- Real-time monitoring statistics
- Memory leak detection
- Performance metrics and timing data
- Proxy cache statistics

### Persistence
- Automatic state persistence to localStorage
- Selective path persistence (user, todos, counters are persisted)
- Blacklisted paths (demo data is not persisted)
- Batch persistence for optimal performance

## Running the Demo

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) to view the demo

## What to Try

1. **Observe Selective Rendering**: 
   - Modify user data and notice only the User Profile component re-renders
   - Add/remove todos and see that counters don't re-render
   - Watch the render counters to understand the efficiency

2. **Test All Methods**:
   - Use the "Change Name" button to see $merge in action
   - Add/remove tags to see array methods working
   - Try the reset buttons to see $reset functionality

3. **Monitor Performance**:
   - Open browser dev tools to see detailed logging
   - Click "Refresh Stats" to see monitoring data
   - Use "Check for Leaks" to verify memory health

4. **Persistence**:
   - Refresh the page to see state restored from localStorage
   - Notice how demo data (like render counts) is not persisted

## Key Insights

- **Ultra-Selective Rendering**: Only components subscribed to changed data re-render
- **Memory Efficiency**: Advanced proxy caching and memory management
- **Developer Experience**: Rich debugging and monitoring capabilities
- **Production Ready**: Automatic leak detection and memory optimization

Open your browser's developer console to see detailed logging and performance metrics! 