import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Stepper, { Step } from './Stepper';
import { getShopName } from '../utils/runtimeConfig';

export default function StepperLocationModal({
  isOpen,
  forceSelection,
  addresses,
  selectedAddressId,
  onSelectAddress,
  buildingOptions,
  selectedBuildingId,
  onSelectBuilding,
  onConfirm,
  onClose,
  isLoading,
  isSaving,
  error,
}) {
  const shopName = getShopName();
  
  // Custom stepper controls
  const [currentStep, setCurrentStep] = useState(1);
  const [stepValidation, setStepValidation] = useState({
    1: true, // Welcome step is always valid
    2: false, // Address and building selection
    3: false, // Final confirmation
  });

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
    }
  }, [isOpen]);

  // Update step validation based on selections
  useEffect(() => {
    setStepValidation(prev => ({
      ...prev,
      2: !isLoading && addresses && addresses.length > 0,
      3: !!selectedAddressId && !!selectedBuildingId,
    }));
  }, [isLoading, addresses, selectedAddressId, selectedBuildingId]);

  const handleNext = () => {
    const nextStep = currentStep + 1;
    
    // Step 1 -> 2: Always allow (just welcome)
    if (currentStep === 1) {
      setCurrentStep(2);
      return;
    }
    
    // Step 2 -> 3: Need both address and building selected
    if (currentStep === 2) {
      if (selectedAddressId && selectedBuildingId) {
        setCurrentStep(3);
      }
      return;
    }
    
    // Step 3: Complete
    if (currentStep === 3) {
      onConfirm();
      return;
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1: return true; // Welcome step
      case 2: return !!selectedAddressId && !!selectedBuildingId;
      case 3: return !isSaving;
      default: return false;
    }
  };

  const getNextButtonText = () => {
    switch (currentStep) {
      case 1: return "开始设置";
      case 2: return (selectedAddressId && selectedBuildingId) ? "下一步" : "请完成地址选择";
      case 3: return isSaving ? "保存中..." : "完成设置";
      default: return "下一步";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 via-violet-500/20 to-pink-500/20 blur-2xl"></div>
        <div className="relative bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600">
                  <i className="fas fa-location-dot text-sm"></i>
                </span>
                配送地址设置
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {forceSelection ? '为确保商品正确配送，请完成地址设置流程。' : '更新配送地址设置'}
              </p>
            </div>
            {!forceSelection && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="关闭"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          <div className="px-6 py-5">
            {/* Custom Step Progress Indicator */}
            <div className="flex items-center justify-center mb-6">
              {[1, 2, 3].map((step, index) => (
                <React.Fragment key={step}>
                  <motion.div 
                    className="flex items-center justify-center w-8 h-8 rounded-full font-semibold text-xs text-white"
                    animate={{
                      backgroundColor: currentStep === step ? '#6366f1' : currentStep > step ? '#10b981' : '#e5e7eb',
                      color: currentStep >= step ? '#ffffff' : '#6b7280'
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    {currentStep > step ? (
                      <i className="fas fa-check text-xs"></i>
                    ) : (
                      step
                    )}
                  </motion.div>
                  {index < 2 && (
                    <motion.div 
                      className="w-16 h-0.5 mx-3 rounded-full"
                      animate={{
                        backgroundColor: currentStep > step ? '#10b981' : '#e5e7eb'
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Step Content with Animation */}
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="min-h-[240px] flex items-center"
                >
                  {currentStep === 1 && (
                    <div className="w-full text-center space-y-4">
                      <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-full flex items-center justify-center mb-4">
                        <i className="fas fa-store text-xl text-white"></i>
                      </div>
                      <h2 className="text-xl font-bold text-gray-900">欢迎来到 {shopName} ！</h2>
                      <p className="text-gray-600 text-sm">
                        {forceSelection 
                          ? '首次使用需要设置配送地址，让我们开始吧！' 
                          : '让我们重新设置您的配送地址信息'
                        }
                      </p>
                      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-xl max-w-md mx-auto">
                        <div className="flex items-center gap-2 text-blue-700">
                          <i className="fas fa-info-circle text-sm"></i>
                          <span className="text-sm font-medium">温馨提示</span>
                        </div>
                        <p className="text-xs text-blue-600 mt-1">
                          准确的地址信息有助于我们为您提供更好的配送服务
                        </p>
                      </div>
                    </div>
                  )}

                  {currentStep === 2 && (
                    <div className="w-full space-y-6">
                      <div className="text-center">
                        <div className="mx-auto w-12 h-12 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center mb-3">
                          <i className="fas fa-location-dot text-lg text-white"></i>
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">选择配送地址</h2>
                        <p className="text-gray-600 mt-1 text-sm">请选择您所在的园区和具体楼栋</p>
                      </div>

                      {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 px-3 py-2 rounded-xl text-sm flex items-start gap-2">
                          <i className="fas fa-exclamation-triangle mt-0.5 text-xs"></i>
                          <span>{error}</span>
                        </div>
                      )}

                      {isLoading ? (
                        <div className="flex items-center justify-center py-8 text-gray-500">
                          <div className="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full mr-2"></div>
                          <span className="text-sm">正在加载可选地址...</span>
                        </div>
                      ) : (
                        <>
                          {(!addresses || addresses.length === 0) ? (
                            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-4 rounded-xl text-center">
                              <i className="fas fa-exclamation-triangle text-lg mb-2"></i>
                              <p className="font-medium mb-1 text-sm">暂无可选择的配送地址</p>
                              <p className="text-xs text-amber-600">请联系管理员添加园区信息</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* 园区选择 */}
                              <div className="space-y-3">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  <i className="fas fa-tree-city text-emerald-500 text-xs"></i>
                                  园区选择
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-1 gap-2 max-h-28 overflow-y-auto pr-1">
                                  {addresses.map(addr => (
                                    <button
                                      key={addr.id}
                                      onClick={() => onSelectAddress(addr.id)}
                                      className={`w-full p-2.5 md:p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                                        selectedAddressId === addr.id
                                          ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                                          : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-25'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 md:gap-2">
                                        <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                          selectedAddressId === addr.id
                                            ? 'border-emerald-500 bg-emerald-500'
                                            : 'border-gray-300'
                                        }`}>
                                          {selectedAddressId === addr.id && (
                                            <div className="w-1 h-1 bg-white rounded-full"></div>
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-gray-900 text-xs md:text-sm truncate">{addr.name}</p>
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* 楼栋选择 */}
                              <div className="space-y-3">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  <i className="fas fa-building text-blue-500 text-xs"></i>
                                  楼栋选择
                                </label>
                                {!selectedAddressId ? (
                                  <div className="text-center py-6 text-gray-400 text-sm">
                                    <i className="fas fa-arrow-left mb-2 text-2xl"></i>
                                    <p>请先选择园区</p>
                                  </div>
                                ) : (!buildingOptions || buildingOptions.length === 0) ? (
                                  <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-4 rounded-xl text-center">
                                    <i className="fas fa-exclamation-triangle text-lg mb-2"></i>
                                    <p className="font-medium mb-1 text-sm">该园区暂无楼栋</p>
                                    <p className="text-xs text-amber-600">请联系管理员添加楼栋信息</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2 max-h-28 overflow-y-auto pr-1">
                                    {buildingOptions.map(building => (
                                      <button
                                        key={building.id}
                                        onClick={() => onSelectBuilding(building.id)}
                                        className={`w-full p-2.5 md:p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                                          selectedBuildingId === building.id
                                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                                            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-25'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 md:gap-2">
                                          <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                            selectedBuildingId === building.id
                                              ? 'border-blue-500 bg-blue-500'
                                              : 'border-gray-300'
                                          }`}>
                                            {selectedBuildingId === building.id && (
                                              <div className="w-1 h-1 bg-white rounded-full"></div>
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 text-xs md:text-sm truncate">{building.name}</p>
                                          </div>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div className="w-full text-center space-y-4">
                      <motion.div 
                        className="mx-auto w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                      >
                        <i className="fas fa-check text-xl text-white"></i>
                      </motion.div>
                      
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-1">地址设置完成！</h2>
                        <p className="text-gray-600 text-sm">您的配送地址已成功设置</p>
                      </div>

                      {/* 显示选择的地址摘要 */}
                      {selectedAddressId && selectedBuildingId && (
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 max-w-md mx-auto">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <i className="fas fa-map-marker-alt text-green-600 text-xs"></i>
                              <span className="text-green-700 font-medium">园区:</span>
                              <span className="text-green-900 font-semibold">
                                {addresses?.find(a => a.id === selectedAddressId)?.name || '已选择'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <i className="fas fa-building text-green-600 text-xs"></i>
                              <span className="text-green-700 font-medium">楼栋:</span>
                              <span className="text-green-900 font-semibold">
                                {buildingOptions?.find(b => b.id === selectedBuildingId)?.name || '已选择'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 max-w-sm mx-auto">
                        <div className="flex items-center gap-2 text-blue-700 mb-1">
                          <i className="fas fa-rocket text-sm"></i>
                          <span className="font-medium text-sm">准备就绪</span>
                        </div>
                        <p className="text-xs text-blue-600">
                          现在您可以开始享受便捷的购物体验了！
                        </p>
                      </div>

                      {isSaving && (
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <div className="animate-spin h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full"></div>
                          <span className="text-sm">正在保存设置...</span>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Custom Navigation Controls */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-400">
                步骤 {currentStep} / 3
              </div>
              <div className="flex items-center gap-3">
                {currentStep > 1 && (
                  <motion.button
                    onClick={handleBack}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    disabled={isSaving}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    上一步
                  </motion.button>
                )}
                <motion.button
                  onClick={handleNext}
                  disabled={!canGoNext()}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    canGoNext() && !isSaving
                      ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-md hover:shadow-lg focus:ring-indigo-500'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  whileHover={canGoNext() && !isSaving ? { scale: 1.02 } : {}}
                  whileTap={canGoNext() && !isSaving ? { scale: 0.98 } : {}}
                >
                  {getNextButtonText()}
                </motion.button>
              </div>
            </div>
          </div>

          {/* 提示信息 */}
          <div className="px-6 pb-3 text-center">
            <div className="text-xs text-gray-400 bg-gray-50/60 rounded-lg px-3 py-1">
              {forceSelection ? '完成设置后即可开始购物' : '修改地址后购物车将被清空'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}