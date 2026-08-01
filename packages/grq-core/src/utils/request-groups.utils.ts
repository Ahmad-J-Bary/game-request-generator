import type { DailyRequest } from "@grq/api-bindings";

export interface RequestGroup {
  event_token: string;
  time_spent: number;
  requests: DailyRequest[];
}

/**
 * Groups requests into cards by event token. A session and its event are kept
 * in a single group even when their per-request time_spent values differ.
 * Requests within a group are sorted Session-first. Groups are sorted by their
 * pacing time in ascending order.
 *
 * Classification is NOT done here: the Rust planner already emits the final
 * request types ("Session Only", "Level Session", "Level Event", ...). This
 * function only groups and renders what it receives.
 */
export const buildRequestGroups = (
  validRequests: DailyRequest[],
): RequestGroup[] => {
  const requestGroups: RequestGroup[] = [];
  for (const request of validRequests) {
    const eventToken = request.event_token || "";
    const existingGroup = requestGroups.find(
      (g) => g.event_token === eventToken,
    );
    if (existingGroup) {
      existingGroup.requests.push(request);
      // Sort requests within the group: Session first, then Event
      existingGroup.requests.sort((a, b) => {
        const typeA = (a.request_type || "").toString().toLowerCase();
        const typeB = (b.request_type || "").toString().toLowerCase();
        const isSessionA = typeA.includes("session");
        const isSessionB = typeB.includes("session");
        if (isSessionA && !isSessionB) return -1;
        if (!isSessionA && isSessionB) return 1;
        return 0;
      });
    } else {
      requestGroups.push({
        event_token: eventToken,
        time_spent: request.time_spent,
        requests: [request],
      });
    }
  }

  // Deterministic pacing: when a group contains an Event, the event's own time
  // drives the card timer. Session-only groups keep the session value.
  for (const group of requestGroups) {
    const eventRequest = group.requests.find((r) =>
      (r.request_type || "").toString().toLowerCase().includes("event"),
    );
    if (eventRequest) {
      group.time_spent = eventRequest.time_spent;
    }
  }

  requestGroups.sort((a, b) => a.time_spent - b.time_spent);
  return requestGroups;
};
