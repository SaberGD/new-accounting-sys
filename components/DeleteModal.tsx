
import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ isOpen, onClose, onConfirm, itemName }) => {
  const { t } = useTheme();
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen) return null;

  const isConfirmed = confirmText.toUpperCase() === 'DELETE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <h3 className="text-xl font-bold text-red-600 mb-4">{t('confirmDelete')}</h3>
        <p className="mb-4 text-gray-600 dark:text-gray-300">
          Are you sure you want to delete <span className="font-bold">"{itemName}"</span>? This action is irreversible.
        </p>
        <p className="mb-2 text-sm text-gray-500">{t('typeDeleteToConfirm')}</p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="w-full p-2 border border-red-300 rounded mb-6 dark:bg-gray-700 dark:border-red-900 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <div className="flex justify-end space-x-3 rtl:space-x-reverse">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => {
              if (isConfirmed) onConfirm();
            }}
            disabled={!isConfirmed}
            className={`px-4 py-2 rounded-lg text-white transition-colors ${
              isConfirmed ? 'bg-red-600 hover:bg-red-700' : 'bg-red-300 cursor-not-allowed'
            }`}
          >
            {t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
