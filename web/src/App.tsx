import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthenticatedLayout } from "./components/AuthenticatedLayout";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { RecoverPassword } from "./pages/RecoverPassword";
import { Profile } from "./pages/Profile";
import { BusinessProfiles } from "./pages/BusinessProfiles";
import { CreateBusinessProfile } from "./pages/CreateBusinessProfile";
import { EditBusinessProfile } from "./pages/EditBusinessProfile";
import { Records } from "./pages/Records";
import { AddExpense } from "./pages/AddExpense";
import { AddSalesRecord } from "./pages/AddSalesRecord";
import { EditExpense } from "./pages/EditExpense";
import { EditSalesRecord } from "./pages/EditSalesRecord";
import { ScanReceipt } from "./pages/ScanReceipt";
import { ImportCsv } from "./pages/ImportCsv";
import { FlaggedRecords } from "./pages/FlaggedRecords";
import { Dashboard } from "./pages/Dashboard";
import { ExpenseInsight } from "./pages/ExpenseInsight";
import { RecoveryInsightPage } from "./pages/RecoveryInsightPage";
import { SpendingImpact } from "./pages/SpendingImpact";
import { Categories } from "./pages/Categories";
import { Notifications } from "./pages/Notifications";

/**
 * `/` serves the public landing page to visitors and skips straight to the
 * dashboard for anyone already signed in — so returning users never have to
 * click past a marketing page to reach their own numbers.
 *
 * Rendered while auth is still resolving as `null` rather than a spinner: the
 * check is a local token read and resolves in a frame or two, and flashing a
 * loader there would be more jarring than a brief blank.
 */
function LandingOrDashboard() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  return profile ? <Navigate to="/dashboard" replace /> : <Landing />;
}

function App() {
  return (
    <BrowserRouter>
      {/* Outside AuthProvider: the theme applies to the landing, login and
          register screens too, and it must not wait on an auth check to be
          applied. */}
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Routes>
                <Route path="/" element={<LandingOrDashboard />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/recover-password" element={<RecoverPassword />} />

                <Route element={<AuthenticatedLayout />}>
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/business-profiles" element={<BusinessProfiles />} />
                  <Route path="/business-profiles/new" element={<CreateBusinessProfile />} />
                  <Route path="/business-profiles/:id/edit" element={<EditBusinessProfile />} />

                  <Route path="/records" element={<Records />} />
                  <Route path="/records/categories" element={<Categories />} />
                  <Route path="/records/expenses/new" element={<AddExpense />} />
                  <Route path="/records/expenses/:id/edit" element={<EditExpense />} />
                  <Route path="/records/sales/new" element={<AddSalesRecord />} />
                  <Route path="/records/sales/:id/edit" element={<EditSalesRecord />} />
                  <Route path="/records/receipts/new" element={<ScanReceipt />} />
                  <Route path="/records/csv-imports/new" element={<ImportCsv />} />
                  <Route path="/records/flagged" element={<FlaggedRecords />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/insights/expense-behavior" element={<ExpenseInsight />} />
                  <Route path="/insights/recovery" element={<RecoveryInsightPage />} />
                  <Route path="/insights/spending-impact" element={<SpendingImpact />} />
                </Route>
              </Routes>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
