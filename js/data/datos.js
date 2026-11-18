// Generado por el build (scripts/build.mjs o el panel admin.html) desde data/catalogo.json y data/negocio.json.
// No editar a mano.
export const CATALOGO = {
  "schema": "ebs.catalogo",
  "version": 1,
  "actualizado": "2026-11-17",
  "fuente": "Carta informada por el propietario el 17/11/2026 (reemplaza los importes del manual de marca, edición 01).",
  "moneda": "ARS",
  "categorias": [
    {
      "id": "hamburguesas",
      "nombre": "Hamburguesas",
      "descripcion": "Las de siempre, desde el carrito.",
      "estado": "activa"
    },
    {
      "id": "sandwiches",
      "nombre": "Sándwiches",
      "descripcion": "Lomito y milanesa de carne o de pollo.",
      "estado": "activa"
    },
    {
      "id": "papas",
      "nombre": "Papas fritas",
      "descripcion": "Porción individual o en caja.",
      "estado": "activa"
    },
    {
      "id": "empanadas",
      "nombre": "Empanadas",
      "descripcion": "De carne o de pollo, por media docena o por docena.",
      "estado": "activa"
    },
    {
      "id": "bebidas",
      "nombre": "Bebidas",
      "descripcion": "Para acompañar tu pedido.",
      "estado": "activa",
      "mensajeVacio": "Próximamente tendremos bebidas."
    }
  ],
  "productos": [
    {
      "id": "hamburguesa-simple",
      "categoria": "hamburguesas",
      "nombre": "Hamburguesa simple",
      "ilustracion": "hamburguesa",
      "estado": "disponible",
      "variantes": [
        {
          "id": "hamburguesa-simple",
          "presentacion": "Unidad",
          "unidades": 1,
          "precio": 4500,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    },
    {
      "id": "hamburguesa-completa",
      "categoria": "hamburguesas",
      "nombre": "Hamburguesa completa",
      "ilustracion": "hamburguesa",
      "estado": "disponible",
      "variantes": [
        {
          "id": "hamburguesa-completa",
          "presentacion": "Unidad",
          "unidades": 1,
          "precio": 6500,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    },
    {
      "id": "hamburguesa-doble",
      "categoria": "hamburguesas",
      "nombre": "Doble paty o KingKong",
      "ilustracion": "hamburguesa-doble",
      "estado": "disponible",
      "variantes": [
        {
          "id": "hamburguesa-doble",
          "presentacion": "Unidad",
          "unidades": 1,
          "precio": 8500,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    },
    {
      "id": "lomito",
      "categoria": "sandwiches",
      "nombre": "Lomito",
      "ilustracion": "lomito",
      "descripcion": "Elegí con papas o sin papas.",
      "imagen": "lomito",
      "alt": "Sándwich de lomito cortado en dos sobre papel.",
      "estado": "disponible",
      "variantes": [
        {
          "id": "lomito-con-papas",
          "presentacion": "Con papas",
          "unidades": 1,
          "precio": 15500,
          "precioEstado": "confirmado",
          "estado": "disponible"
        },
        {
          "id": "lomito-sin-papas",
          "presentacion": "Sin papas",
          "unidades": 1,
          "precio": 12500,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    },
    {
      "id": "milanesa-carne",
      "categoria": "sandwiches",
      "nombre": "Sándwich de milanesa de carne",
      "ilustracion": "milanesa",
      "imagen": "sandwich_milanesa_carne",
      "alt": "Sándwich de milanesa de carne cortado en dos.",
      "estado": "disponible",
      "variantes": [
        {
          "id": "milanesa-carne",
          "presentacion": "Unidad",
          "unidades": 1,
          "precio": 10000,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    },
    {
      "id": "milanesa-pollo",
      "categoria": "sandwiches",
      "nombre": "Sándwich de milanesa de pollo",
      "ilustracion": "milanesa",
      "imagen": "sandwich_milanesa_pollo",
      "alt": "Sándwich de milanesa de pollo cortado en dos.",
      "estado": "disponible",
      "variantes": [
        {
          "id": "milanesa-pollo",
          "presentacion": "Unidad",
          "unidades": 1,
          "precio": 10000,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    },
    {
      "id": "papas-fritas",
      "categoria": "papas",
      "nombre": "Papas fritas",
      "ilustracion": "papas",
      "descripcion": "Elegí porción individual o en caja.",
      "imagen": "papas_mediana_caja",
      "alt": "Papas fritas en una caja de cartón abierta.",
      "estado": "disponible",
      "variantes": [
        {
          "id": "papas-individual",
          "presentacion": "Porción individual",
          "unidades": 1,
          "precio": 3500,
          "precioEstado": "confirmado",
          "estado": "disponible"
        },
        {
          "id": "papas-mediana-caja",
          "presentacion": "En caja",
          "unidades": 1,
          "precio": 6000,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    },
    {
      "id": "empanadas-carne",
      "categoria": "empanadas",
      "nombre": "Empanadas de carne",
      "ilustracion": "empanadas",
      "descripcion": "Elegí media docena o docena.",
      "imagen": "empanadas",
      "alt": "Seis empanadas doradas sobre una bandeja.",
      "estado": "disponible",
      "variantes": [
        {
          "id": "empanadas-carne-6",
          "presentacion": "Media docena",
          "unidades": 6,
          "precio": 6500,
          "precioEstado": "confirmado",
          "estado": "disponible"
        },
        {
          "id": "empanadas-carne-12",
          "presentacion": "Docena",
          "unidades": 12,
          "precio": 12000,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    },
    {
      "id": "empanadas-pollo",
      "categoria": "empanadas",
      "nombre": "Empanadas de pollo",
      "ilustracion": "empanadas",
      "descripcion": "Elegí media docena o docena.",
      "imagen": "empanadas",
      "alt": "Seis empanadas doradas sobre una bandeja.",
      "estado": "disponible",
      "variantes": [
        {
          "id": "empanadas-pollo-6",
          "presentacion": "Media docena",
          "unidades": 6,
          "precio": 6500,
          "precioEstado": "confirmado",
          "estado": "disponible"
        },
        {
          "id": "empanadas-pollo-12",
          "presentacion": "Docena",
          "unidades": 12,
          "precio": 12000,
          "precioEstado": "confirmado",
          "estado": "disponible"
        }
      ]
    }
  ],
  "proximas": [
    {
      "id": "pizzas",
      "nombre": "Pizzas",
      "estado": "futuro",
      "comunicar": false,
      "nota": "Planificado. Sin receta, precio ni fecha. No comprable."
    }
  ],
  "historicos": []
};

export const NEGOCIO = {
  "schema": "ebs.negocio",
  "version": 1,
  "actualizado": "2026-11-17",
  "nombre": "El Buen Sabor",
  "nombreHistorico": "Burguer Truck",
  "lema": "Siempre hay algo rico.",
  "mensajeTransicion": "Crecimos. Y el sabor sigue.",
  "sitio": {
    "url": "https://misiomis.github.io/burguer_truck/"
  },
  "whatsapp": {
    "estado": "confirmado",
    "numero": "5493757626892"
  },
  "direccion": {
    "estado": "confirmado",
    "texto": "Calle Costa Rica",
    "localidad": "Comandante Andresito, Misiones",
    "mapaUrl": "https://maps.app.goo.gl/rrjarzStdaCkGc1o9"
  },
  "horarios": {
    "estado": "confirmado",
    "lista": [
      {
        "dias": "Martes a domingo",
        "horario": "19:30 a 23:45"
      },
      {
        "dias": "Lunes",
        "horario": "Cerrado"
      }
    ]
  },
  "modalidades": {
    "retiro": {
      "estado": "confirmado"
    },
    "envio": {
      "estado": "confirmado",
      "zonas": [
        {
          "id": "zona-centro",
          "nombre": "Zona Centro",
          "tarifa": 1000,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-belgrano",
          "nombre": "Barrio Belgrano",
          "tarifa": 1800,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-quintas-altas",
          "nombre": "Barrio Quintas Altas",
          "tarifa": 1500,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-cantera",
          "nombre": "Barrio Cantera",
          "tarifa": 1800,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "zona-industrial",
          "nombre": "Zona Industrial",
          "tarifa": 2000,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-9-de-julio",
          "nombre": "Barrio 9 de Julio",
          "tarifa": 1500,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "villa-nueva",
          "nombre": "Villa Nueva",
          "tarifa": 3000,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-obrero",
          "nombre": "Barrio Obrero",
          "tarifa": 1800,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-120-viviendas",
          "nombre": "Barrio 120 Viviendas",
          "tarifa": 1800,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-80-viviendas",
          "nombre": "Barrio 80 Viviendas",
          "tarifa": 1500,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-26-viviendas",
          "nombre": "Barrio 26 Viviendas",
          "tarifa": 1500,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-la-selva-1",
          "nombre": "Barrio La Selva 1",
          "tarifa": 1500,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-la-selva-2",
          "nombre": "Barrio La Selva 2",
          "tarifa": 1800,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-fm",
          "nombre": "Barrio FM",
          "tarifa": 1800,
          "tarifaEstado": "confirmada"
        },
        {
          "id": "barrio-emsa",
          "nombre": "Barrio EMSA",
          "tarifa": 1500,
          "tarifaEstado": "confirmada"
        }
      ]
    }
  },
  "mediosDePago": {
    "estado": "pendiente",
    "lista": []
  },
  "redes": [],
  "portada": {
    "fotos": []
  }
};
