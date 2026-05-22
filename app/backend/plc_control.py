from pymodbus.client import ModbusSerialClient
from pymodbus.framer import ModbusRtuFramer

def trigger_m60():
    try:
        client = ModbusSerialClient(
            port="COM5",
            framer=ModbusRtuFramer,
            baudrate=115200,
            parity="N",
            stopbits=1,
            bytesize=8,
            timeout=0.5
        )
        if client.connect():
            # Write True to M60 coil
            client.write_coils(0x083C, [True], slave=1)
            client.close()
            return True
        else:
            return False
    except Exception as e:
        print(f"PLC Trigger Error: {e}")
        return False
