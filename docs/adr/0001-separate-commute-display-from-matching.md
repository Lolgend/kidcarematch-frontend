---
status: accepted
---

# Keep centre-detail commute estimates separate from matching

Centre details need route geometry, selectable travel modes, representative weekday/weekend samples, and explicit unavailable states. Provide these through a distinct display contract while retaining existing matching scores and their current routing/fallback behaviour, as requested for this feature. Sharing the matching result directly would either expose a straight-line fallback as a routed journey or change ranking semantics while adding the map; a separate contract preserves the sibling backend's ADR-0007 matching policy and makes the distinction deliberate.
