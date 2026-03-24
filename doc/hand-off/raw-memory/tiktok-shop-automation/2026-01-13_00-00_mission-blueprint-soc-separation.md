# 🛡️ Mission Blueprint: Separation of Concerns (Image vs Video Result Detection)

**Task**: Decouple result detection and validation to ensure Video Gen doesn't interfere with Image Gen and vice-versa.
**Strategy**: **Parallel Logic (Mode-based Separation)**
**Target Project**: `tiktok-shop-automation`
**Base Branch**: `staging`

## 1. Architectural Changes (SoC)

| Feature | Image Generation (Stage 1) | Video Generation (Stage 2) |
| :--- | :--- | :--- |
| **Mode** | `image` | `video` |
| **Selector** | `SELECTORS.generatedImage` (img tags) | `SELECTORS.generatedVideo` (video tags) |
| **Validation** | `_isValidGeneratedImage(img)` (Size-based) | `_isValidGeneratedVideo(video)` (URL-based) |
| **Data Key** | `generatedImageUrl` | `generatedVideoUrl` |

## 2. Implementation Plan

### Phase 1: Selector Expansion
- Add `generatedVideo` to `SELECTORS` constant.
- Keep `generatedImage` strictly for images (>100px, no logos).

### Phase 2: Logic Branching
- Refactor `handleWaitResultState` to use an `if (currentMode === 'video')` block.
- **Video Path**: 
  - Poll for `<video>` elements.
  - Validate using Google Storage URL pattern (`/video/` segment).
  - Extract `src` and report success.
- **Image Path**: 
  - (UNCHANGED) Maintain current robust polling/validation for images.

### Phase 3: Validation Protocol
- Implement `_isValidGeneratedVideo(video)`:
  - Check for `tagName === 'VIDEO'`.
  - Check for `src` presence.
  - Check for storage URL signature.
  - Skip size checks (naturalHeight/Width are invalid for videos).

### Phase 4: State Machine Harmonization
- Update `FLOW_STATES.COMPLETED` transition to include both `generatedImageUrl` and `generatedVideoUrl` in the payload where appropriate, or contextually based on mode.

---

## 3. The Friction Protocol (Risk Assessment)

### 3 Risks
1. **State Leakage**: If `currentMode` is not accurately tracked globally, the system might poll for the wrong tag type.
2. **Post-Generation UI**: Google might use a temporary `img` (placeholder) for video before the `video` tag is ready. Simple polling might catch the placeholder if not carefully filtered.
3. **Data Schema Conflict**: Downstream code (Side Panel/Background) might expect only `generatedImageUrl`. If we send `generatedVideoUrl`, we must ensure it doesn't break the product model.

### 1 Counter-argument
**Why not use a generic "Result" selector?**
- *Argument*: We could just search for `img, video` and use a unified `src` extraction.
- *Rebuttal*: This violates **Separation of Concerns**. A unified selector would be prone to "False Positives" (e.g., catching a video ad while waiting for an image, or vice versa). Explicit separation is more **Robust** and **Simple** to debug.

### 4. Integrity Check
- **Compliance**: Follows "Simple + Robust + Convention".
- **Safety**: "Nothing is deleted" - we don't remove image logic; we append video logic as a separate branch.
- **Traceability**: All changes will be logged in session logs.

---
**Oracle Note**: This plan ensures that the stability of the Image Generation stage is preserved 100% while enabling the Video Generation stage to operate with high precision.
