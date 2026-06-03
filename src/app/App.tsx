import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../features/auth";
import { ThemeProvider } from "../shared/theme/ThemeProvider";
import { AppRouter } from "./router";

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
