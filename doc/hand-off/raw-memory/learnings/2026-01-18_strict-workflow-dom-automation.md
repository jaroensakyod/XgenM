# Strategic Plan: Strict Workflow for DOM Automation + State Machine

**Date**: 2026-01-18 09:25 GMT+7
**Status**: PLANNING PHASE (No implementation yet)
**Context**: Resolving Image Gen flow tab switching issue - Using lessons from failures

---

## 🎯 **Problem Statement**

### Current Challenge
After Video Gen completes, the automation needs to handle Image Gen but:
- **Issue**: Google Flow UI may "remember" the Videos tab state
- **Risk**: Naive tab switching broke the state machine (page reload, context death)
- **Requirement**: Must be simple + robust + not break existing flows

### Why Previous Attempts Failed
1. No API discovery before coding
2. No understanding of React side-effects
3. No DevTools pre-validation
4. Iterative patching instead of root analysis
5. No clear workflow discipline

---

## 🏗️ **The STRICT WORKFLOW for DOM Automation**

For any DOM-based automation that interacts with a complex state machine, use this **4-Phase Methodology**:

---

## **PHASE 0: DISCOVERY (Mandatory - No Coding)**

### **Goal**: Understand the system deeply before touching it

### **Step 0.1: Map Target Application Architecture**
```
ACTION: Read core architectural files
FILES:
  - flow-state-machine.js (understand state graph)
  - human-behavior.js (understand what bot detection mitigations exist)
  - flow-content-script.js (understand entry points)
  - Services (understand business logic separation)

DOCUMENT:
  ✓ What states exist?
  ✓ What are valid transitions?
  ✓ What triggers page reload or navigation?
  ✓ What's the load order (manifest.json)?
  ✓ What global objects exist (window.*)
```

### **Step 0.2: Map Target DOM (Google Flow)**
```
ACTION: Open DevTools on target (Google Flow page)

QUESTIONS:
  Q1: What is the "Images" tab selector?
      → document.querySelectorAll('button[role="radio"]')
      → Filter by text content
      → VERIFY manually in Console

  Q2: What happens when I click it?
      → Watch Network tab
      → Check Console for errors
      → Does page reload? Does URL change?
      → Does React state change? (React DevTools)

  Q3: After switch, what's the DOM structure?
      → Are selectors for image upload still valid?
      → Are content script context still alive?

  Q4: What's the timing?
      → How long does UI render?
      → When are all buttons interactive?
      → What's the "ready" signal?

DOCUMENT:
  Selector snapshots (both states: videos vs images)
  Network behavior on tab switch
  React DevTools state changes
```

### **Step 0.3: Map All Possible Side-Effects**
```
ACTION: Trace what happens when tab switches

SCENARIOS:
  1. Normal switch: Click tab → UI updates → No reload
  2. Error case: Click tab → Page reloads → Script context dies
  3. Race condition: Click tab → Partial state → What state?
  4. Lazy loading: Click tab → Chunks load → Timing?

DOCUMENT:
  ✓ Which scenario happens in practice?
  ✓ How to detect which scenario occurred?
  ✓ How to recover from each?
```

### **Step 0.4: Design Failure Modes & Recovery**
```
Failure Mode 1: Tab button not found
  └─ Recovery: Increase wait time or reload page

Failure Mode 2: Tab switches but selectors invalid
  └─ Recovery: Reload page for fresh state

Failure Mode 3: Page reloads, context dies
  └─ Recovery: Don't switch tab, reload page instead

DOCUMENT:
  ✓ How to detect each failure?
  ✓ Best recovery strategy?
  ✓ Fallback if recovery fails?
```

---

## **PHASE 1: DESIGN (Architecture-First)**

### **Goal**: Design the MINIMAL intervention point

### **Key Principle**
> "The fewer things we change, the fewer things can break"

### **Option A: State Reset via Reload (RECOMMENDED)**
```javascript
// Pros:
//   ✓ Clean slate - no state confusion
//   ✓ Simplest to implement
//   ✓ Can't cause cascade failures
//   ✓ All context reinitialized
//
// Cons:
//   ✗ Slower (reload takes 2-3 seconds)
//
// When to use:
//   • First attempt should be this
//   • Most robust approach

Design:
  IF (currentMode === 'video' AND tabState === 'videos')
    window.location.reload()
    Wait for reload → fresh context
    Resume flow
  ELSE
    Continue normally
```

### **Option B: Defensive Query Check (ALTERNATIVE)**
```javascript
// Pros:
//   ✓ No page interaction
//   ✓ Fast
//
// Cons:
//   ✗ Requires understanding React state deeply
//   ✗ Fragile if UI changes
//   ✗ Might miss edge cases
//
// When to use:
//   • If Option A is too slow
//   • Only after Option A thoroughly tested

Design:
  Query current active tab state
  IF (not in image mode)
    Skip the problematic flow
    Log warning
    Retry cycle
  ELSE
    Continue
```

### **Option C: Smart Tab Switch (HIGH RISK - NOT RECOMMENDED)**
```javascript
// The approach we tried - disabled for now
// Only use after Options A & B proven insufficient

Risk: Very high (proven to cascade)
```

---

## **PHASE 2: IMPLEMENTATION (Defensive Coding)**

### **Goal**: Code with maximum clarity + logging + fallbacks

### **2.1 API Discovery First**
```javascript
// BEFORE writing any code that calls internal APIs:

// Find every usage of the API in codebase
grep -r "yourAPI" features/

// Read the actual implementation
cat core/your-api.js | head -50

// Document the EXACT signature
/**
 * @param {string} selector - CSS selector string
 * @param {Object} options - { timeout, visible, etc }
 * @returns {Promise<Element|null>}
 */

// Test it in DevTools manually
await yourAPI('your-selector', { timeout: 1000 })
```

### **2.2 Modular Functions with State Tracking**
```javascript
/**
 * Attempt to normalize flow state before image generation
 * 
 * @returns {Object} { success: bool, method: string, warnings: [] }
 */
async function normalizeFlowStateBeforeImageGen() {
  const result = {
    success: false,
    method: null,
    warnings: []
  };

  try {
    // STEP 1: Query current state
    const currentTab = detectCurrentTab();
    log('Current tab detected', 'Normalize', 'info', currentTab);

    // STEP 2: Check if normalization needed
    if (currentTab === 'images') {
      result.success = true;
      result.method = 'SKIP';
      log('Already in images mode, skipping normalization', 'Normalize', 'info');
      return result;
    }

    // STEP 3: Execute normalization (clean reload)
    log('Normalizing via page reload...', 'Normalize', 'info');
    window.location.reload();
    
    // This line will never execute - reload kills context
    // But keeps code symmetric
    result.success = true;
    result.method = 'RELOAD';
    return result;

  } catch (error) {
    log('Normalization failed', 'Normalize', 'error', { error: error.message });
    result.success = false;
    result.warnings.push(error.message);
    return result;
  }
}
```

### **2.3 Comprehensive Logging (State Machine Traceability)**
```javascript
// EVERY decision point must have logging

log('About to normalize state', 'ImageGen', 'info', {
  currentMode: window.FlowSchema.getCurrentMode(),
  currentTab: detectCurrentTab(),
  timestamp: new Date().toISOString()
});

// Try operation
const result = await normalizeFlowStateBeforeImageGen();

log('Normalization result', 'ImageGen', 'info', result);

// Conditional branching with logging
if (result.success) {
  log('Proceeding to image generation', 'ImageGen', 'info');
  // continue flow
} else {
  log('Normalization failed, transitioning to ERROR', 'ImageGen', 'error');
  transitionTo(FLOW_STATES.ERROR, { reason: 'State normalization failed' });
}
```

### **2.4 Human Behavior Integration**
```javascript
// Timing for human authenticity:
// - Don't switch state immediately (looks automated)
// - Add small delay before operations
// - Use random delays per human-behavior.js patterns

async function normalizeFlowStateWithHumanTiming() {
  // Think time before action
  await thinkingPause(1000, 2000);
  
  // Add natural randomness
  const shouldReload = Math.random() < 0.3; // 30% chance
  
  if (shouldReload) {
    // Human might "refresh if something feels off"
    await randomScroll(1, 2);
    await sleep(500 + Math.random() * 500);
    window.location.reload();
  }
  
  return true;
}
```

---

## **PHASE 3: VALIDATION (DevTools-Driven Testing)**

### **Goal**: Validate before committing

### **Checklist (MANDATORY)**
```
□ Step 1: API Validation
  - Open DevTools
  - Test your API calls manually
  - Verify return types
  - Expected: No errors, correct objects returned

□ Step 2: Selector Validation
  - Open DevTools Console
  - Run your selectors manually
  - document.querySelectorAll('your-selector')
  - Expected: Finds correct elements, data-state correct

□ Step 3: State Transition Tracing
  - Open DevTools Sources
  - Set breakpoint in flow-state-machine.js
  - Step through your code
  - Expected: State transitions are correct, no loops

□ Step 4: Side-Effect Verification
  - Open DevTools Network tab
  - Run your code
  - Expected: No surprise redirects, no page reloads (unless intentional)

□ Step 5: Context Survival Check
  - Open DevTools Console
  - Check if window.* globals still exist after operation
  - Check if content script still responsive
  - Expected: All globals intact, no console errors

□ Step 6: React State Inspection
  - Install React DevTools extension
  - Inspect Google Flow component tree
  - Run your code, watch for errors
  - Expected: No React errors, state consistent

□ Step 7: Secondary Product Test
  - Run full automation on 2nd product
  - Don't use 1st product (might have stale state)
  - Expected: Normal flow, no cascade failures
```

### **Failure Recovery Decision Tree**
```
Test fails?
├─ API error?
│  └─ Go back to PHASE 0, Step 0.2
│
├─ Selector not found?
│  └─ Go back to PHASE 0, Step 0.2 (DOM changed?)
│
├─ Page reload unexpected?
│  └─ Go back to PHASE 1 (choose different option)
│
├─ Context dies?
│  └─ Go back to PHASE 1 (redesign to avoid in-page manipulation)
│
└─ State confusion?
   └─ Go back to PHASE 1 (add defensive state reset)
```

---

## **PHASE 4: INTEGRATION (Staged Rollout)**

### **Goal**: Merge safely with monitoring

### **Step 4.1: Feature Branch**
```bash
git checkout -b feat/image-flow-normalization
```

### **Step 4.2: Single Commit (Atomic)**
```bash
# ONE clean commit, not 3+ iterations
git commit -m "feat: Add state normalization before image generation

Uses page reload strategy for clean state reset
- Detects current tab state
- If in video mode, reloads page
- Maintains human-like timing
- Comprehensive logging for diagnostics

Prevents cascade failures from in-flight state changes
Tested: [list what you tested]
"
```

### **Step 4.3: Test on Live**
```
1. Reload extension
2. Run full batch (video + image sequentially)
3. Monitor console for logs
4. Expected: All flows complete successfully
```

### **Step 4.4: Merge to Staging**
```bash
git checkout staging
git merge feat/image-flow-normalization --no-ff
```

---

## **🎓 Key Principles (For Future Work)**

### **Principle 1: Discovery Before Coding**
- 30% time researching, 70% coding
- Previous approach: 10% discovery → caused all failures
- New approach: 30% discovery → prevents failures

### **Principle 2: Minimal Intervention**
- Change ONE thing at a time
- Prefer: Reload page (externals) over switching state (internals)
- Avoid: Complex state manipulation in heavy React apps

### **Principle 3: Defensive by Default**
- Log everything
- Assume failure at every step
- Provide clear error messages
- Make debugging obvious

### **Principle 4: Test Before Commit**
- DevTools is your best friend
- Manual testing catches 80% of bugs
- "Hypothesis" ≠ "verified"

### **Principle 5: One Idea Per Commit**
- Previous: 3 commits of patching
- New: 1 commit of complete solution
- Easier to review, easier to rollback

---

## **📊 Comparison: Old vs New Approach**

| Aspect | Old (Failed) | New (Proposed) |
|--------|-------------|----------------|
| **Discovery** | Skip to coding | 30% time on Phase 0 |
| **API usage** | Assume signature | Read implementation |
| **Testing** | Commit first | DevTools first |
| **Iterations** | 3+ patches | 1 complete solution |
| **Rollback** | After 3 failures | After 0 failures |
| **Logging** | Minimal | Comprehensive |
| **Intervention** | Complex state change | Simple reload |

---

## **🛡️ Why This Prevents Cascade Failures**

### Current failure chain:
```
Miss API → API error → Add sleep → Still fails → Change approach → Page reload → Context dies → "แตกยับ"
```

### New approach short-circuits:
```
Discover API in Phase 0 → Correct usage in Phase 2 → Validate in Phase 3 → Single commit → Success
```

---

## **Next Steps**

When you're ready, we'll execute:
1. **Phase 0 Discovery** (Manual DevTools work)
2. **Phase 1 Design** (Choose reload vs query)
3. **Phase 2 Implementation** (Code once, code right)
4. **Phase 3 Validation** (DevTools testing)
5. **Phase 4 Integration** (Single clean commit)

**No execution until you approve the plan** 🛡️
