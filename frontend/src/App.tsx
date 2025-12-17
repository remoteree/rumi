import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import BookCreator from './pages/BookCreator';
import BookList from './pages/BookList';
import BookDetail from './pages/BookDetail';
import AdminDashboard from './pages/AdminDashboard';
import BookAdmin from './pages/BookAdmin';
import Login from './pages/Login';
import Signup from './pages/Signup';
import PublisherDashboard from './pages/PublisherDashboard';
import ReviewerDashboard from './pages/ReviewerDashboard';
import Subscriptions from './pages/Subscriptions';
import FindPublisher from './pages/FindPublisher';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { MenuBook, Logout, Person } from '@mui/icons-material';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Access denied. You don't have permission to access this page.
        </Alert>
      </Container>
    );
  }

  return <>{children}</>;
}

function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Redirect based on user role
  if (user.role === 'publisher') {
    return <Navigate to="/publisher" replace />;
  } else if (user.role === 'reviewer') {
    return <Navigate to="/reviewer" replace />;
  } else if (user.role === 'admin') {
    return <Navigate to="/admin" replace />;
  } else if (user.role === 'writer') {
    return <BookCreator />;
  }

  return <Navigate to="/login" />;
}

function AppContent() {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <MenuBook sx={{ mr: 1, color: 'primary.main' }} />
          <Typography
            variant="h6"
            component={Link}
            to={user ? "/" : "/login"}
            sx={{
              flexGrow: 0,
              fontWeight: 600,
              textDecoration: 'none',
              color: 'primary.main',
              mr: 4,
            }}
          >
            AI Kindle Creator
          </Typography>
          <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
            {user ? (
              <>
                {(user.role === 'writer' || user.role === 'admin') && (
                  <>
                    <Button component={Link} to="/" color="inherit">Create Book</Button>
                    <Button component={Link} to="/books" color="inherit">My Books</Button>
                    <Button component={Link} to="/subscriptions" color="inherit">Subscription</Button>
                    <Button component={Link} to="/publishers" color="inherit">Find Publisher</Button>
                  </>
                )}
                {user.role === 'publisher' && (
                  <Button component={Link} to="/publisher" color="inherit">Dashboard</Button>
                )}
                {user.role === 'reviewer' && (
                  <Button component={Link} to="/reviewer" color="inherit">Manuscripts</Button>
                )}
                {user.role === 'admin' && (
                  <Button component={Link} to="/admin" color="inherit">Admin</Button>
                )}
              </>
            ) : (
              <>
                <Button component={Link} to="/login" color="inherit">Login</Button>
                <Button component={Link} to="/signup" color="inherit">Sign Up</Button>
              </>
            )}
          </Box>
          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Chip
                icon={<Person />}
                label={`${user.name} (${user.role})`}
                color="primary"
                variant="outlined"
                size="small"
              />
              <Button
                startIcon={<Logout />}
                onClick={logout}
                color="inherit"
                variant="outlined"
                size="small"
              >
                Logout
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default' }}>
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/signup" element={user ? <Navigate to="/" /> : <Signup />} />
          <Route
            path="/"
            element={<RootRedirect />}
          />
          <Route
            path="/books"
            element={
              <ProtectedRoute allowedRoles={['writer', 'admin']}>
                <BookList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/books/:id"
            element={
              <ProtectedRoute>
                <BookDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/books/:id/admin"
            element={
              <ProtectedRoute>
                <BookAdmin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/publisher"
            element={
              <ProtectedRoute allowedRoles={['publisher']}>
                <PublisherDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviewer"
            element={
              <ProtectedRoute allowedRoles={['reviewer']}>
                <ReviewerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscriptions"
            element={
              <ProtectedRoute allowedRoles={['writer', 'admin']}>
                <Subscriptions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/publishers"
            element={
              <ProtectedRoute allowedRoles={['writer', 'admin']}>
                <FindPublisher />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={user ? (user.role === 'publisher' ? '/publisher' : user.role === 'reviewer' ? '/reviewer' : user.role === 'admin' ? '/admin' : '/') : "/login"} />} />
        </Routes>
      </Box>
    </Box>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

