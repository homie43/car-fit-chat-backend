/**
 * Admin module types
 */

export interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  language: string;
  createdAt: Date;
  dialogCount: number;
  messageCount: number;
}

export interface DialogListItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
}

export interface LogListItem {
  id: string;
  kind: string;
  userId: string | null;
  dialogId: string | null;
  status: string | null;
  latencyMs: number | null;
  createdAt: Date;
}

export interface DialogExportFormat {
  dialog: {
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  messages: Array<{
    id: string;
    role: string;
    content: string;
    moderationStatus: string;
    createdAt: Date;
  }>;
  exportedAt: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
