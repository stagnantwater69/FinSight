import { Outlet } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { BusinessProfileProvider } from "../context/BusinessProfileContext";
import { ExpenseCategoryProvider } from "../context/ExpenseCategoryContext";
import { NotificationProvider } from "../context/NotificationContext";
import { AppShell } from "./AppShell";

/**
 * Provider order matters here: notifications are scoped to the selected
 * business profile, so NotificationProvider has to sit inside
 * BusinessProfileProvider to read it.
 */
export function AuthenticatedLayout() {
  return (
    <ProtectedRoute>
      <BusinessProfileProvider>
        <ExpenseCategoryProvider>
          <NotificationProvider>
            <AppShell>
              <Outlet />
            </AppShell>
          </NotificationProvider>
        </ExpenseCategoryProvider>
      </BusinessProfileProvider>
    </ProtectedRoute>
  );
}
