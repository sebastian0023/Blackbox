export interface AuthenticatedPrincipal {
  readonly csrfTokenHash: string;
  readonly email: string;
  readonly sessionId: string;
  readonly userId: string;
}

export interface AuthenticatedRequest {
  principal?: AuthenticatedPrincipal;
}
