export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
  refresh_token?: string; // Not requested in our implementation
}
