export function createSyncManager(onStatusChange = () => {}) {
  let pendingWrites = 0;
  let status = "local";
  let stickyError = null;

  function emit() {
    onStatusChange(status, { pendingWrites, error: stickyError });
  }

  function getError() { return stickyError; }

  function beginSync() {
    pendingWrites += 1;
    status = "syncing";
    emit();
  }

  function completeSync() {
    pendingWrites = Math.max(0, pendingWrites - 1);
    stickyError = null;
    status = pendingWrites > 0 ? "syncing" : "synced";
    emit();
  }

  function failSync(error) {
    pendingWrites = Math.max(0, pendingWrites - 1);
    stickyError = error || new Error("Erreur sync");
    status = pendingWrites > 0 ? "syncing" : "error";
    emit();
  }

  function track(promise) {
    beginSync();
    return Promise.resolve(promise)
      .then((result) => {
        completeSync();
        return result;
      })
      .catch((err) => {
        failSync(err);
        throw err;
      });
  }

  function getStatus() {
    return status;
  }

  return { beginSync, completeSync, failSync, track, getStatus, getError };
}
