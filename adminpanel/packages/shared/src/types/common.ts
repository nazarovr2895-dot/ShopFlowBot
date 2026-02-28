export interface City {
  id: number
  name: string
  kladr_id?: string
}

export interface District {
  id: number
  name: string
  city_id: number
}

export interface MetroStation {
  id: number
  name: string
  district_id?: number
  line_color?: string
}
