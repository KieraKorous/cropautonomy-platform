import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";

import { CapturePage } from "./pages/CapturePage.js";
import { QueuePage } from "./pages/QueuePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { SessionPickerPage } from "./pages/SessionPickerPage.js";

export function App() {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <Routes>
          <Route path="/" element={<SessionPickerPage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SignedIn>
    </>
  );
}
