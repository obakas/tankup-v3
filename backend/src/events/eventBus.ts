type EventPayload = {
  type: string;
  data: unknown;
};

class EventBus {
  emit(event: EventPayload) {
    console.log("EVENT:", event);
  }
}

export const eventBus = new EventBus();