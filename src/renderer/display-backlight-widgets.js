'use strict';

{
  function createBacklightWidgets(api) {
    if (!api?.displayBacklightWidgets || !api.onDisplayBacklightWidgets) return null;
    const subscribers = new Set();
    let snapshot = { version: 0 };
    let generation = 0;
    let wanted = false;
    let pending;
    let blocked = false;
    let applying;
    let hasRead = false;

    function publish(reading) {
      snapshot = { reading, version: snapshot.version + 1 };
      for (const subscriber of subscribers) subscriber(snapshot);
    }

    async function read() {
      if (!wanted || pending || applying || blocked || !subscribers.size) return;
      wanted = false;
      const request = generation;
      pending = { generation: request };
      try {
        const result = await api.displayBacklightWidgets({ type: 'read' });
        if (request === generation && subscribers.size) {
          hasRead = result?.reason !== 'busy';
          publish(result?.ok ? result : undefined);
        }
      } catch {
        if (request === generation && subscribers.size) {
          hasRead = true;
          publish(undefined);
        }
      } finally {
        pending = undefined;
        if (wanted) void read();
      }
    }

    function refresh() {
      if (blocked || !subscribers.size) return;
      wanted = true;
      queueMicrotask(read);
    }

    function invalidate() {
      generation++;
      hasRead = false;
      if (snapshot.reading) publish(undefined);
    }

    api.onDisplayBacklightWidgets((reason) => {
      if (reason === 'invalidated' || reason === 'dialog-change') invalidate();
      if (!snapshot.reading) refresh();
    });

    function cancel(owner) {
      if (applying?.owner !== owner) return;
      applying.cancelled = true;
      void api.displayBacklightWidgets({ type: 'cancel', owner }).catch(() => {});
    }

    return {
      subscribe(callback) {
        subscribers.add(callback);
        callback(snapshot);
        if (!hasRead && pending?.generation !== generation) refresh();
        return () => {
          subscribers.delete(callback);
          if (!subscribers.size) {
            wanted = false;
            hasRead = false;
            invalidate();
          }
        };
      },
      async write(owner, token, percent) {
        if (blocked || applying || pending || token !== snapshot.reading?.token) {
          throw new Error('Brightness changed. Read the current value and try again.');
        }
        const request = { owner, generation };
        applying = request;
        try {
          const result = await api.displayBacklightWidgets({ type: 'apply', owner, token, percent });
          if (request.cancelled || request.generation !== generation || !result?.ok) {
            if (result?.reason !== 'busy') { hasRead = false; refresh(); }
            throw new Error(result?.ok ? 'The brightness control changed.' : result?.message ?? 'Could not verify brightness.');
          }
          publish(result);
          return snapshot;
        } finally {
          applying = undefined;
          if (wanted) void read();
        }
      },
      cancel,
      setBlocked(next) {
        blocked = next;
        if (blocked) {
          invalidate();
          if (applying) cancel(applying.owner);
        } else if (!hasRead) refresh();
      },
    };
  }

  const api = { createBacklightWidgets };
  if (typeof module === 'object') module.exports = api;
  else window.LastraBacklightWidgets = api;
}
