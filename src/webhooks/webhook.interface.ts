export interface WebhookEvent {
  event: string;
  data: Record<string, any>;
  timestamp?: string;
}
