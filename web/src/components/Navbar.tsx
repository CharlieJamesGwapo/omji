import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/authStore';

const Navbar: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-gray-900 text-white shadow-lg sticky top-0 z-50">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="text-2xl font-bold flex items-center">
          <span className="text-blue-400">O</span>
          <span className="text-orange-400">M</span>
          <span className="text-green-400">J</span>
          <span className="text-purple-400">I</span>
        </Link>

        {isAuthenticated ? (
          <div className="flex items-center gap-6">
            <div className="hidden md:flex gap-6">
              <Link to="/" className="hover:text-blue-400 transition">Dashboard</Link>
              <Link to="/rides" className="hover:text-blue-400 transition">Book Ride</Link>
              <Link to="/delivery" className="hover:text-orange-400 transition">Delivery</Link>
              <Link to="/stores" className="hover:text-green-400 transition">Stores</Link>
              <Link to="/driver" className="hover:text-purple-400 transition">Driver</Link>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="btn-secondary text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <Link to="/login" className="btn-secondary">
              Login
            </Link>
            <Link to="/register" className="btn-primary">
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
