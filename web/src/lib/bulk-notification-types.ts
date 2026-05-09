/** Shape of bulk notification rows from `/api/bulk-notifications/`. */
export type ApiBulkNotificationRow = {
  id: number;
  title?: string;
  message: string;
  link?: string;
  image?: string | null;
  created_at: string;
  restaurant?: number | null;
};
