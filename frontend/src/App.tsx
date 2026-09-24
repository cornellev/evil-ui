import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Grid,
  Button,
} from "@mui/material";
import RunsList from "./pages/RunsList";
import RunDetail from "./pages/RunDetail";
import UploadRecording from "./pages/UploadRecording";
import ChatPanel from "./components/ChatPanel";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#242424" },
  },
});

export default function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <AppBar position="static" color="transparent" elevation={0}>
          <Toolbar sx={{ gap: 2 }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              EVIL UI
            </Typography>
            <Button component={Link} to="/" color="inherit">
              Runs
            </Button>
            <Button component={Link} to="/upload" color="inherit">
              Upload
            </Button>
          </Toolbar>
        </AppBar>

        <Box sx={{ p: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Routes>
                <Route path="/" element={<RunsList />} />
                <Route path="/runs/:runId" element={<RunDetail />} />
                <Route path="/upload" element={<UploadRecording />} />
              </Routes>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} sx={{ height: "calc(100vh - 100px)" }}>
              <ChatPanel />
            </Grid>
          </Grid>
        </Box>
      </BrowserRouter>
    </ThemeProvider>
  );
}
