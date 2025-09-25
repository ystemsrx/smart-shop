import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import LocationModal from '../components/LocationModal';
import { getApiBaseUrl } from '../utils/runtimeConfig';

const LocationContext = createContext(null);

const API_BASE = getApiBaseUrl();

export function LocationProvider({ children }) {
  const { user, isInitialized } = useAuth();
  const [location, setLocation] = useState(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [forceSelection, setForceSelection] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [buildingCache, setBuildingCache] = useState({});
  const [buildingOptions, setBuildingOptions] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const addressesRef = useRef(addresses);
  const addressesLoadedRef = useRef(addressesLoaded);
  const buildingCacheRef = useRef(buildingCache);

  useEffect(() => {
    addressesRef.current = addresses;
  }, [addresses]);

  useEffect(() => {
    addressesLoadedRef.current = addressesLoaded;
  }, [addressesLoaded]);

  useEffect(() => {
    buildingCacheRef.current = buildingCache;
  }, [buildingCache]);

  const fetchJSON = useCallback(async (url, options = {}) => {
    const resp = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.success) {
      const message = data.message || `HTTP ${resp.status}`;
      throw new Error(message);
    }
    return data;
  }, []);

  const ensureAddressesLoaded = useCallback(async (force = false) => {
    if (!force && addressesLoadedRef.current) {
      return addressesRef.current;
    }
    try {
      const data = await fetchJSON(`${API_BASE}/addresses`);
      const list = data.data?.addresses || [];
      setAddresses(list);
      setAddressesLoaded(true);
      addressesRef.current = list;
      addressesLoadedRef.current = true;
      return list;
    } catch (err) {
      console.error('获取地址列表失败:', err.message);
      setAddressesLoaded(false);
      addressesLoadedRef.current = false;
      throw err;
    }
  }, [fetchJSON]);

  const loadBuildingsFor = useCallback(async (addressId) => {
    if (!addressId) {
      setBuildingOptions([]);
      return [];
    }
    if (buildingCacheRef.current[addressId]) {
      setBuildingOptions(buildingCacheRef.current[addressId]);
      return buildingCacheRef.current[addressId];
    }
    try {
      const data = await fetchJSON(`${API_BASE}/buildings?address_id=${encodeURIComponent(addressId)}`);
      const list = data.data?.buildings || [];
      setBuildingCache(prev => {
        const next = { ...prev, [addressId]: list };
        buildingCacheRef.current = next;
        return next;
      });
      setBuildingOptions(list);
      return list;
    } catch (err) {
      console.error('获取楼栋列表失败:', err.message);
      setBuildingOptions([]);
      throw err;
    }
  }, [fetchJSON]);

  const loadProfile = useCallback(async () => {
    if (!user || user.type !== 'user') {
      setLocation(null);
      setModalOpen(false);
      setForceSelection(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchJSON(`${API_BASE}/profile/shipping`);
      const profile = data.data?.shipping || null;
      setLocation(profile);
      const hasLocation = profile && profile.address_id && profile.building_id;
      if (!hasLocation) {
        const addrList = await ensureAddressesLoaded();
        
        // 如果没有可用的地址（即管理员只创建了园区但没有楼栋）
        if (!addrList || addrList.length === 0) {
          setSelectedAddressId('');
          setSelectedBuildingId('');
          setBuildingOptions([]);
          setForceSelection(true);
          setModalOpen(true);
          return;
        }
        
        // 只有当有可用地址时，才设置默认值
        const defaultAddressId = profile?.address_id || addrList[0]?.id;
        setSelectedAddressId(defaultAddressId);
        
        if (defaultAddressId) {
          const buildings = await loadBuildingsFor(defaultAddressId);
          const fallbackBuildingId = profile?.building_id || buildings[0]?.id || '';
          setSelectedBuildingId(fallbackBuildingId);
        } else {
          setSelectedBuildingId('');
          setBuildingOptions([]);
        }
        setForceSelection(true);
        setModalOpen(true);
      } else {
        setForceSelection(false);
        setModalOpen(false);
        setSelectedAddressId(profile.address_id);
        if (profile.address_id) {
          loadBuildingsFor(profile.address_id);
          setSelectedBuildingId(profile.building_id || '');
        }
      }
    } catch (err) {
      setError(err.message || '加载收货资料失败');
      setForceSelection(true);
      setModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, [user, fetchJSON, ensureAddressesLoaded, loadBuildingsFor]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!user || user.type !== 'user') {
      setLocation(null);
      setModalOpen(false);
      setForceSelection(false);
      return;
    }
    loadProfile();
  }, [user, isInitialized, loadProfile]);

  const openLocationModal = useCallback(async (options = {}) => {
    if (!user || user.type !== 'user') return;
    try {
      const {
        forceReload = false,
        resetSelection = false,
        enforceSelection = false,
      } = options;
      const addrList = await ensureAddressesLoaded(forceReload);

      // 如果没有可用的地址
      if (!addrList || addrList.length === 0) {
        setSelectedAddressId('');
        setSelectedBuildingId('');
        setBuildingOptions([]);
        setForceSelection(true);
        setModalOpen(true);
        return;
      }

      // 只有当有可用地址时，才设置默认值
      const addrId = resetSelection ? (addrList[0]?.id || '') : (location?.address_id || addrList[0]?.id || '');
      setSelectedAddressId(addrId);
      const buildings = addrId ? await loadBuildingsFor(addrId) : [];
      const buildingId = resetSelection ? (buildings[0]?.id || '') : (location?.building_id || buildings[0]?.id || '');
      setSelectedBuildingId(buildingId);
      setForceSelection(enforceSelection);
      setModalOpen(true);
      setError('');
    } catch (err) {
      setError(err.message || '无法加载地址，请稍后重试');
      setModalOpen(true);
      setForceSelection(true);
    }
  }, [user, location, ensureAddressesLoaded, loadBuildingsFor]);

  const closeLocationModal = useCallback(() => {
    if (forceSelection) return;
    setModalOpen(false);
    setError('');
  }, [forceSelection]);

  const selectAddress = useCallback(async (addressId) => {
    setSelectedAddressId(addressId);
    try {
      const buildings = await loadBuildingsFor(addressId);
      setSelectedBuildingId(buildings[0]?.id || '');
    } catch (err) {
      setError(err.message || '获取楼栋信息失败');
    }
  }, [loadBuildingsFor]);

  const selectBuilding = useCallback((buildingId) => {
    setSelectedBuildingId(buildingId);
  }, []);

  const saveLocation = useCallback(async () => {
    if (!selectedAddressId || !selectedBuildingId) {
      setError('请选择完整的地址与楼栋');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const data = await fetchJSON(`${API_BASE}/profile/location`, {
        method: 'POST',
        body: JSON.stringify({
          address_id: selectedAddressId,
          building_id: selectedBuildingId,
        })
      });
      const shipping = data.data?.shipping || null;
      setLocation(shipping);
      setForceSelection(false);
      setModalOpen(false);
      setRevision(prev => prev + 1);
    } catch (err) {
      setError(err.message || '更新地址失败');
    } finally {
      setIsSaving(false);
    }
  }, [selectedAddressId, selectedBuildingId, fetchJSON]);

  const forceReselectAddress = useCallback(async () => {
    if (!user || user.type !== 'user') return;
    setLocation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        dormitory: '',
        building: '',
        full_address: '',
        address_id: '',
        building_id: '',
        agent_id: '',
      };
    });
    setRevision(prev => prev + 1);
    addressesLoadedRef.current = false;
    setAddressesLoaded(false);
    setForceSelection(true);
    setError('');
    setModalOpen(true);
    setIsLoading(true);
    try {
      const addrList = await ensureAddressesLoaded(true);
      const nextAddressId = addrList[0]?.id || '';
      setSelectedAddressId(nextAddressId);
      if (nextAddressId) {
        const buildings = await loadBuildingsFor(nextAddressId);
        setSelectedBuildingId(buildings[0]?.id || '');
      } else {
        setSelectedBuildingId('');
        setBuildingOptions([]);
      }
    } catch (err) {
      setSelectedAddressId('');
      setSelectedBuildingId('');
      setBuildingOptions([]);
      setError(err.message || '无法加载地址，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, [user, ensureAddressesLoaded, loadBuildingsFor]);

  const value = {
    location,
    isLoading,
    isSaving,
    isModalOpen,
    forceSelection,
    addresses,
    buildingOptions,
    selectedAddressId,
    selectedBuildingId,
    error,
    revision,
    openLocationModal,
    closeLocationModal,
    selectAddress,
    selectBuilding,
    saveLocation,
    reloadLocation: loadProfile,
    forceReselectAddress,
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
      <LocationModal
        isOpen={isModalOpen && user?.type === 'user'}
        forceSelection={forceSelection}
        addresses={addresses}
        selectedAddressId={selectedAddressId}
        onSelectAddress={selectAddress}
        buildingOptions={buildingOptions}
        selectedBuildingId={selectedBuildingId}
        onSelectBuilding={selectBuilding}
        onConfirm={saveLocation}
        onClose={closeLocationModal}
        isLoading={isLoading}
        isSaving={isSaving}
        error={error}
      />
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}
