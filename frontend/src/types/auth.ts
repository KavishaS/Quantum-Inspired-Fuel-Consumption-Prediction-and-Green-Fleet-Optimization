export type UserRole = "admin" | "analyst" | "auditor";

export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

export interface DemoUserProfile {
  username: string;
  display_name: string;
  role: UserRole;
  meta: {
    title: string;
    description: string;
    badge_color: string;
  };
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}
