import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { seedDataService } from '../src/utils/seedData';
import { hashPassword, verifyPasswordHash } from '../src/utils/hashUtils';

const cashierId = '33333333-3333-4333-8333-333333333333';
const managerId = '44444444-4444-4444-8444-444444444444';
const mariaAdminId = '55555555-5555-4555-8555-555555555555';
const carlosAdminId = '66666666-6666-4666-8666-666666666666';
const systemAdminId = '77777777-7777-4777-8777-777777777777';

function stubSeedFetch() {
  const files: Record<string, string> = {
    'employees.yml': `employees:\n  - id: "${cashierId}"\n    employee_number: "CSH001"\n    name: "Ana Costa"\n    phone: "+351 915 678 901"\n    pin: "9999"\n    role: "cashier"\n    access_levels: ["sales"]\n    is_active: true\n    hire_date: "2024-01-15"\n  - id: "${managerId}"\n    employee_number: "MGR001"\n    name: "João Pereira"\n    pin: "9999"\n    role: "manager"\n    access_levels: ["sales", "inventory"]\n    is_active: true\n    hire_date: "2024-01-15"\n  - id: "${mariaAdminId}"\n    employee_number: "ADM001"\n    name: "Maria Santos"\n    password_hash: "wrong-admin-default"\n    role: "admin"\n    access_levels: ["all"]\n    is_active: true\n    hire_date: "2024-01-15"\n  - id: "${carlosAdminId}"\n    employee_number: "SYS001"\n    name: "Carlos Silva"\n    password_hash: "wrong-carlos-default"\n    role: "admin"\n    access_levels: ["all"]\n    is_active: true\n    hire_date: "2024-01-15"\n  - id: "${systemAdminId}"\n    employee_number: "ADMIN001"\n    name: "System Administrator"\n    password_hash: "wrong-system-admin-default"\n    role: "admin"\n    access_levels: ["all"]\n    is_active: true\n    hire_date: "2024-01-15"\n`,
  };

  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const filename = url.split('/').pop() ?? '';
    const body = files[filename];

    if (!body) {
      return Promise.resolve(new Response('', { status: 404 }));
    }

    return Promise.resolve(new Response(body, { status: 200 }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('startup local seed', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await initializeLocalDatabase();
    await localDb.employees.clear();
    await localDb.categories.clear();
    await localDb.products.clear();
    await localDb.employeeSyncQueue.clear();
    await localDb.categorySyncQueue.clear();
    await localDb.productSyncQueue.clear();
  });

  it('loads YAML employees into IndexedDB before login providers read them', async () => {
    const fetchMock = stubSeedFetch();

    const result = await seedDataService.seedLocalFromYaml({ useStartupJson: false });

    expect(result.success).toBe(true);
    expect(result.details.employeesCount).toBe(5);
    expect(result.details.categoriesCount).toBe(0);
    expect(result.details.productsCount).toBe(0);

    const cashier = await localDb.employees.where('employee_number').equals('CSH001').first();
    expect(cashier?.name).toBe('Ana Costa');
    expect(cashier?.id).toBe(cashierId);
    expect(cashier?.pin).toBeTruthy();
    expect(await verifyPasswordHash('1111', cashier?.pin ?? '')).toBe(true);
    expect(await localDb.categories.count()).toBe(0);
    expect(await localDb.products.count()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses startup-seed.json when available so production does not depend on YAML serving', async () => {
    const jsonEmployeeId = '88888888-8888-4888-8888-888888888888';
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/startup-seed.json')) {
        return Promise.resolve(new Response(JSON.stringify({
          employees: [{
            id: jsonEmployeeId,
            employee_number: 'JSON001',
            name: 'JSON Cashier',
            pin: '9999',
            role: 'cashier',
            access_levels: ['sales'],
            is_active: true,
            hire_date: '2024-01-15',
          }],
          categories: [],
          products: [],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }));

    const result = await seedDataService.seedLocalFromYaml();
    const employee = await localDb.employees.where('employee_number').equals('JSON001').first();

    expect(result.details.employeesCount).toBe(1);
    expect(result.details.categoriesCount).toBe(0);
    expect(result.details.productsCount).toBe(0);
    expect(employee?.id).toBe(jsonEmployeeId);
    expect(await verifyPasswordHash('1111', employee?.pin ?? '')).toBe(true);
  });

  it('applies startup credential defaults by role', async () => {
    stubSeedFetch();

    await seedDataService.seedLocalFromYaml();

    const [cashier, manager, mariaAdmin, carlosAdmin, systemAdmin] = await Promise.all([
      localDb.employees.where('employee_number').equals('CSH001').first(),
      localDb.employees.where('employee_number').equals('MGR001').first(),
      localDb.employees.where('employee_number').equals('ADM001').first(),
      localDb.employees.where('employee_number').equals('SYS001').first(),
      localDb.employees.where('employee_number').equals('ADMIN001').first(),
    ]);

    expect(await verifyPasswordHash('1111', cashier?.pin ?? '')).toBe(true);
    expect(await verifyPasswordHash('2222', manager?.pin ?? '')).toBe(true);
    expect(await verifyPasswordHash('0099', mariaAdmin?.password_hash ?? '')).toBe(true);
    expect(await verifyPasswordHash('0099', carlosAdmin?.password_hash ?? '')).toBe(true);
    expect(await verifyPasswordHash('password', systemAdmin?.password_hash ?? '')).toBe(true);
  });

  it('is idempotent, keeps local profile edits, and migrates startup credentials', async () => {
    stubSeedFetch();

    await seedDataService.seedLocalFromYaml();
    await localDb.employees.update(cashierId, { name: 'Local Rename', pin: await hashPassword('9999') });
    await seedDataService.seedLocalFromYaml();

    const employee = await localDb.employees.get(cashierId);
    expect(employee?.name).toBe('Local Rename');
    expect(await verifyPasswordHash('1111', employee?.pin ?? '')).toBe(true);
  });
});
