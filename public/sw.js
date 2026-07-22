/* GradeDate Push Notification Service Worker */

self.addEventListener("push", (event) => {
  const data = event.data?.json();

  const options = {
    body: data?.body || "",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: {
      url: data?.url || "/connections",
    },
    requireInteraction: false,
    tag: "gradedate-notification",
  };

  event.waitUntil(
    self.registration.showNotification(
      data?.title || "GradeDate",
      options,
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/connections";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus an existing window matching the URL
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
