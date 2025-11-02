import { Routes, Route, Link } from 'react-router-dom';
import BookCreator from './pages/BookCreator';
import BookList from './pages/BookList';
import BookDetail from './pages/BookDetail';
import AdminDashboard from './pages/AdminDashboard';
import BookAdmin from './pages/BookAdmin';
import './App.css';

function App() {
  return (
    <div className="App">
      <nav className="navbar">
        <div className="container">
          <Link to="/" className="logo">📚 AI Kindle Creator</Link>
          <div className="nav-links">
            <Link to="/">Create Book</Link>
            <Link to="/books">My Books</Link>
            <Link to="/admin">Admin</Link>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<BookCreator />} />
          <Route path="/books" element={<BookList />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/books/:id/admin" element={<BookAdmin />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

