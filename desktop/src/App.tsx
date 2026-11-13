import NotchOverlay from "./components/notch/NotchOverlay";

/**
 * Desktop overlay shell. The window itself is transparent, frameless and
 * pinned to the top-center of the screen; everything the user sees is the
 * notch (pill → toast → expanded surface) rendered by NotchOverlay.
 */
export default function App() {
  return (
    <div className="w-full h-full">
      <NotchOverlay />
    </div>
  );
}
