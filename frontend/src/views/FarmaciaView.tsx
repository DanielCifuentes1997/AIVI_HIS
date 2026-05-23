/* eslint-disable */
import { useState, useEffect } from 'react';

export default function FarmaciaView() {
  const [orders, setOrders] = useState<any[]>([]);

  const fetchOrders = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/farmacia/orders');
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = async (orderId: string, status: 'alistando' | 'despacho') => {
    try {
      const response = await fetch(`http://localhost:8000/api/farmacia/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_status: status })
      });
      if (response.ok) fetchOrders();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Tablero de Control de Farmacia</h2>
      <p>Muestra las recetas que los pacientes ya autorizaron con su firma electrónica.</p>
      <button onClick={fetchOrders} style={{ marginBottom: '15px', padding: '8px' }}>Refrescar Tablero</button>
      
      {orders.length === 0 ? <p>No hay órdenes autorizadas para despacho en este momento.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: '#eee', textAlign: 'left' }}>
              <th style={{ padding: '10px', border: '1px solid #ccc' }}>ID Orden</th>
              <th style={{ padding: '10px', border: '1px solid #ccc' }}>Medicamentos</th>
              <th style={{ padding: '10px', border: '1px solid #ccc' }}>Estado Actual</th>
              <th style={{ padding: '10px', border: '1px solid #ccc' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td style={{ padding: '10px', border: '1px solid #ccc' }}>{order.id.slice(0,8)}...</td>
                <td style={{ padding: '10px', border: '1px solid #ccc' }}>
                  {order.prescription_data?.medications?.map((m:any) => m.name).join(', ')}
                </td>
                <td style={{ padding: '10px', border: '1px solid #ccc', fontWeight: 'bold' }}>{order.delivery_status.toUpperCase()}</td>
                <td style={{ padding: '10px', border: '1px solid #ccc', display: 'flex', gap: '5px' }}>
                  <button onClick={() => updateStatus(order.id, 'alistando')} style={{ backgroundColor: 'orange', border: 'none', padding: '5px', cursor: 'pointer' }}>Alistando</button>
                  <button onClick={() => updateStatus(order.id, 'despacho')} style={{ backgroundColor: 'green', color: 'white', border: 'none', padding: '5px', cursor: 'pointer' }}>Despacho</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
