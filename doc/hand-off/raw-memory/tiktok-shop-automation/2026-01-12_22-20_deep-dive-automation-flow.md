# Snapshot: Deep Dive - Dual-Pipeline Automation Flow

**Time**: 2026-01-12 22:20
**Context**: Deep analysis of the automation logic (`flow-content-script.js`, `flow-state-machine.js`) and UI (`flow-tab.js`, `video-tab.js`).
**Mode**: Oracle Keeper

## 🧬 The Dual-Pipeline Architecture

The automation isn't a single linear path. It uses a **Router Pattern** at the entry point (`handleStartState`) to split into two distinct pipelines.

### 1. The Entry Router
Located in `flow-content-script.js`, `handleStartState` acts as the traffic controller:
```javascript
async function handleStartState(data) {
  const mode = data.mode || currentMode || 'image';
  if (mode === 'video') return handleVideoStartState(data);
  else return handleImageStartState(data);
}
```

### 2. Pipeline Stage 1: Image Generation (Flow Tab)
-   **UI**: `ui/sidepanel/flow-tab.js`
-   **Trigger**: User selects products -> "Start Automation".
-   **FSM Path**: `START` (Image Mode) → `FILL_IMAGES` (Character + Product) → `FILL_PROMPT` → `GENERATE` → `WAIT_RESULT`.
-   **Output**: Captures the generated image URL and updates `product.generatedImageUrl`.

### 3. Pipeline Stage 2: Video Generation (Video Tab)
-   **UI**: `ui/sidepanel/video-tab.js`.
-   **Dependency**: Requires `generatedImageUrl` from Stage 1.
-   **Trigger**: User selects products (filtered by `generatedImageUrl` existence) -> "Start Video Gen".
-   **FSM Path**: `START` (Video Mode) → `SWITCH_MODE` → `UPLOAD_START_FRAME` → `FILL_VIDEO_PROMPT` → `GENERATE_VIDEO`.
-   **Key Logic**:
    *   **Reuse Project**: `handleVideoStartState` supports `reuseProject` flag to skip creating a new project if the session is already active.
    *   **Mode Switcher**: `switchMode` function intelligently detects "Text to Video" vs "Frames to Video" UI states (handling Radix UI complexities).
    *   **Start Frame**: Uses `generatedImageUrl` as the *First Frame* input for "Frames to Video".

## 🧩 User Interface Separation
The Side Panel explicitly separates these stages into tabs, reflecting the mental model:
-   **Tab 1 (Flow)**: "Create the Asset" (Image composition).
-   **Tab 2 (Video)**: "Animate the Asset" (Image to Video).

## ⚠️ Critical Observations
1.  **State Isolation**: The FSM is strictly typed. Transitions like `FILL_IMAGES` → `UPLOAD_START_FRAME` are forbidden. You must go back to `START` (or `IDLE`) to switch pipelines.
2.  **Strict Handlers**: `flow-content-script.js` separates `handleImageStartState` and `handleVideoStartState` to prevent logic contamination.
3.  **Cross-pipeline data**: The connection is solely via the `product` object in `chrome.storage`. Stage 1 writes to it, Stage 2 reads from it.

## Tags
`#architecture` `#state-machine` `#router-pattern` `#dual-pipeline`
