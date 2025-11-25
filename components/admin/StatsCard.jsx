import React from 'react';
import { motion } from 'framer-motion';

export const StatsCard = ({ title, value, icon, color = "indigo" }) => {
  const colorClasses = {
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <motion.div 
      whileHover={{ y: -2, shadow: "0 10px 30px -10px rgba(0,0,0,0.1)" }}
      className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 p-6 transition-all duration-300"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{value}</h3>
        </div>
        <div className={`flex-shrink-0 ${colorClasses[color] || colorClasses.indigo} rounded-xl p-3`}>
          <div className="text-xl">{icon}</div>
        </div>
      </div>
    </motion.div>
  );
};

export default StatsCard;
