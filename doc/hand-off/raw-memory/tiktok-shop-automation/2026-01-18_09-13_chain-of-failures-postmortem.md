# Snapshot: Chain of Failures - Tab Switch Guard Collapse

**Time**: 2026-01-18 09:13 GMT+7
**Context**: Post-mortem analysis of why "simple tab switch guard" turned into "แตกยับ"
**Severity**: CRITICAL - Pattern Recognition for Future

---

## 🔴 **The Five-Link Failure Chain**

### **Link 1️⃣: Missing API Signature Discovery**

**Mistake:**
```javascript
// ❌ What I coded
const imagesButton = await findElement({
  selector: 'button[role="radio"]',
  matcher: (el) => el.textContent.includes('image')
})

// ✅ Actual API
const element = await findElement(selector, options)
```

**Why It Broke:**
- Assumed `findElement()` accepts object-based config
- Didn't read `core/dom.js` or check existing usage patterns
- Result: `"selectors is not iterable"` error immediately

**Lesson:**
- **NEVER assume** internal API signatures
- **ALWAYS grep existing code** for API usage patterns
- **ALWAYS read** the actual implementation before calling

---

### **Link 2️⃣: Misdiagnosis of Root Problem**

**Mistake:**
- Saw error → thought "maybe tab buttons not rendered yet"
- Added `sleep(1.5s)` as solution
- **But the actual problem was API signature, not timing**

**Why It Cascaded:**
- "Fixed" API but left deeper issue unresolved
- Band-aid approach instead of root diagnosis
- Each "fix" added complexity without solving core issue

**Lesson:**
- **Don't iterate on symptoms**, diagnose root cause first
- **"Try, Fail, Add Complexity"** ≠ good engineering
- **"Try, Fail, Dig Deeper"** = correct approach

---

### **Link 3️⃣: Ignored React State Machine Complexity**

**Mistake:**
```javascript
// Naive assumption:
imagesButton.click()
// → React updates data-state
// → Flow continues normally
```

**Reality:**
- Google Flow is a **heavy React application** with:
  - Complex global state machine
  - Possible URL/route changes on tab switch
  - Side-effects that trigger **page reload**
  - Lazy-loaded modules and suspense boundaries
- When page reloads → content script context dies → automation breaks

**Why I Missed It:**
- Didn't read `flow-state-machine.js`
- Didn't check Network tab in DevTools
- Didn't consider "what happens if page reloads?"

**Lesson:**
- **Understand the target app architecture** before modifying its state
- **Complex React apps have high side-effect cost** for UI state changes
- **Page reload = script context death** in content scripts

---

### **Link 4️⃣: No Pre-Commit Testing**

**Mistake:**
```javascript
// What I should have done:
1. ✓ Open DevTools
2. ✓ Run: document.querySelectorAll('button[role="radio"]')
3. ✓ Step-through ensureImagesTabActive() in debugger
4. ✓ Check Network tab for redirects
5. ✓ Verify content script survived

// What I actually did:
1. ✓ Wrote code
2. ✓ Committed
3. ✗ Tested
```

**Why It Compounded:**
- 3 iterations of commits
- Each one got progressively worse
- Could have caught it before first commit

**Lesson:**
- **Test in DevTools BEFORE committing**
- **Use debugger to step-through** critical flows
- **No "shipping hypothesis"** - only shipping verified code

---

### **Link 5️⃣: Cascade Loop - "Fix Worse"**

**The Pattern:**
```
❌ Iteration 1: API signature error
         ↓ "Add sleep"
❌ Iteration 2: Still API error + timing issue
         ↓ "Use querySelectorAll instead"
❌ Iteration 3: Tab switch → page reload → context death → "แตกยับ"
         ↓ (WORSE than before!)
```

**Why This Happened:**
- Didn't stop to re-analyze after each failure
- Kept adding patches instead of removing the feature
- "Sunk cost fallacy" - couldn't admit the approach was wrong

**Lesson:**
- **Fail fast, fail small** → Rollback immediately
- **Don't iterate on a broken foundation**
- **If 2+ fixes don't work, the approach is wrong**

---

## 🛡️ **How to Avoid This Pattern**

### **Discovery Phase (BEFORE coding)**
```javascript
// 1. Read the target code
grep -r "findElement" features/google-flow/
grep -r "querySelector" core/

// 2. Understand the architecture
cat features/google-flow/flow-state-machine.js | head -100

// 3. Manual testing
// Open DevTools → run your selectors manually

// 4. Check side-effects
// Open Network tab → switch tab manually → observe
```

### **Architecture Phase (BEFORE implementing)**
```javascript
// Question: "What are the side-effects of switching this state?"
// Google Flow: Heavy React app
// Answer: Might trigger reload, state confusion, navigation

// Better approach:
// Instead of: Click tab (high risk)
// Do: Reload page (clean slate) OR skip this flow entirely
```

### **Testing Phase (BEFORE committing)**
```javascript
// Minimal checklist:
1. Run code in DevTools manually
2. Step-through with debugger
3. Check Network tab for anomalies
4. Verify content script context survives
5. Test on a secondary product
```

---

## 📊 **Impact Assessment**

| Phase | Commits | Breaking Changes | Could Have Prevented |
|-------|---------|------------------|---------------------|
| Link 1 | 1 | API error | Pre-commit grep + read |
| Link 2 | 1 | Same error | Root cause analysis |
| Link 3 | 1 | Page reload crash | Understand React app |
| Chain | 3 | Progressively worse | Rollback after iteration 1 |

---

## 🎓 **Universal Lessons for Future**

### **1. Respect API Boundaries**
- Never assume signatures
- Always verify before calling
- External = potentially different than internal

### **2. Heavy Frameworks Need Archaeology**
- React apps have invisible side-effects
- State changes might trigger reloads, navigation, etc.
- Modifying UI state = high-risk operation

### **3. Fail Fast = Succeed Fast**
- If 2 fixes don't work, hypothesis is wrong
- Rollback is not defeat, it's wisdom
- "Try-and-forget" is expensive; "try-and-learn" is valuable

### **4. DevTools Before Commits**
- Manual testing catches 80% of bugs
- Debugger is your friend
- Network tab reveals side-effects

### **5. Never Iterate on Broken Foundation**
- Broken → Add patch → More broken
- Better: Broken → Analyze → Different approach

---

## 🔮 **Next Session Approach**

**For tab switching problem (if we revisit):**
```javascript
// Option A: Clean slate via reload
async function ensureImagesMode() {
  if (isCurrentlyInVideoMode()) {
    window.location.reload();
    return new Promise(() => {}); // Wait for reload
  }
  return true;
}

// Option B: Skip entirely
// Just reload Google Flow before starting image gen
```

**Why these work:**
- Option A: Page reload = completely fresh state machine
- Option B: Avoids trying to switch state in-flight

---

## Tags

`failure-chain` `api-mismatch` `react-side-effects` `devtools-testing` `rollback-wisdom` `architecture-archaeology`
