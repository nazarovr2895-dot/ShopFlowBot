import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { isTelegram } from '../utils/environment';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Layout guard: allows access to main app without auth (browser opens without redirect to landing).
 * - In Telegram: always allow (initData is available).
 * - In Browser: always allow (auth is offered in Profile).
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  return <>{children}</>;
}

/** Query param for redirect after login, e.g. ?from=checkout */
export const REQUIRE_AUTH_FROM_CHECKOUT = 'checkout';
export const REQUIRE_AUTH_FROM_ORDERS = 'orders';

interface RequireAuthProps {
  children: React.ReactNode;
  /** Redirect target: profile?from=checkout or profile?from=orders */
  from: 'checkout' | 'orders';
}

/**
 * Requires authentication only for specific routes (checkout, orders).
 * In browser, if not authenticated, redirects to /profile?from=checkout|orders.
 */
export function RequireAuth({ children, from }: RequireAuthProps) {
  const fromParam = from === 'checkout' ? REQUIRE_AUTH_FROM_CHECKOUT : REQUIRE_AUTH_FROM_ORDERS;

  if (isTelegram()) {
    return <>{children}</>;
  }

  if (!api.isAuthenticated()) {
    return <Navigate to={`/profile?from=${fromParam}`} replace />;
  }

  return <>{children}</>;
}
