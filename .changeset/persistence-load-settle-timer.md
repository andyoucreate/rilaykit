---
'@rilaykit/workflow': patch
---

Clear the persistence load-settle timer on unmount. `loadPersistedData` scheduled a 100ms `setIsLoadingPersisted(false)` timer that nothing cancelled; unmounting inside that window fired React state on a torn-down hook. The timer is now tracked, mount-guarded, and cancelled in the unmount cleanup.
