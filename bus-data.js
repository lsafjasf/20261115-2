// 内置公交到站数据（含少量重复记录，用于验证去重逻辑）
// 字段: route 线路, stop 站点名, stopIndex 站点序号, time 到站时间(HH:MM), vehicle 车辆编号
const BUS_RECORDS = [
  // ---- 12路 ----
  { route: "12路", stop: "火车站",   stopIndex: 0, time: "07:05", vehicle: "A01" },
  { route: "12路", stop: "火车站",   stopIndex: 0, time: "07:25", vehicle: "A02" },
  { route: "12路", stop: "火车站",   stopIndex: 0, time: "07:25", vehicle: "A02" }, // 重复记录
  { route: "12路", stop: "火车站",   stopIndex: 0, time: "07:50", vehicle: "A03" },
  { route: "12路", stop: "火车站",   stopIndex: 0, time: "08:20", vehicle: "A04" },
  { route: "12路", stop: "火车站",   stopIndex: 0, time: "08:35", vehicle: "A05" },
  { route: "12路", stop: "人民广场", stopIndex: 1, time: "07:12", vehicle: "A01" },
  { route: "12路", stop: "人民广场", stopIndex: 1, time: "07:33", vehicle: "A02" },
  { route: "12路", stop: "人民广场", stopIndex: 1, time: "07:58", vehicle: "A03" },
  { route: "12路", stop: "人民广场", stopIndex: 1, time: "07:58", vehicle: "A03" }, // 重复记录
  { route: "12路", stop: "人民广场", stopIndex: 1, time: "08:29", vehicle: "A04" },
  { route: "12路", stop: "人民广场", stopIndex: 1, time: "08:44", vehicle: "A05" },
  { route: "12路", stop: "图书馆",   stopIndex: 2, time: "07:20", vehicle: "A01" },
  { route: "12路", stop: "图书馆",   stopIndex: 2, time: "07:41", vehicle: "A02" },
  { route: "12路", stop: "图书馆",   stopIndex: 2, time: "08:07", vehicle: "A03" },
  { route: "12路", stop: "图书馆",   stopIndex: 2, time: "08:38", vehicle: "A04" },
  { route: "12路", stop: "图书馆",   stopIndex: 2, time: "08:55", vehicle: "A05" },
  { route: "12路", stop: "体育馆",   stopIndex: 3, time: "07:31", vehicle: "A01" },
  { route: "12路", stop: "体育馆",   stopIndex: 3, time: "07:54", vehicle: "A02" },
  { route: "12路", stop: "体育馆",   stopIndex: 3, time: "08:19", vehicle: "A03" },
  { route: "12路", stop: "体育馆",   stopIndex: 3, time: "08:52", vehicle: "A04" },
  { route: "12路", stop: "体育馆",   stopIndex: 3, time: "08:52", vehicle: "A04" }, // 重复记录
  { route: "12路", stop: "体育馆",   stopIndex: 3, time: "09:08", vehicle: "A05" },
  { route: "12路", stop: "大学城",   stopIndex: 4, time: "07:44", vehicle: "A01" },
  { route: "12路", stop: "大学城",   stopIndex: 4, time: "08:06", vehicle: "A02" },
  { route: "12路", stop: "大学城",   stopIndex: 4, time: "08:33", vehicle: "A03" },
  { route: "12路", stop: "大学城",   stopIndex: 4, time: "09:05", vehicle: "A04" },
  { route: "12路", stop: "大学城",   stopIndex: 4, time: "09:22", vehicle: "A05" },
  // ---- 36路 ----
  { route: "36路", stop: "汽车东站", stopIndex: 0, time: "07:10", vehicle: "B01" },
  { route: "36路", stop: "汽车东站", stopIndex: 0, time: "07:40", vehicle: "B02" },
  { route: "36路", stop: "汽车东站", stopIndex: 0, time: "08:15", vehicle: "B03" },
  { route: "36路", stop: "汽车东站", stopIndex: 0, time: "08:15", vehicle: "B03" }, // 重复记录
  { route: "36路", stop: "汽车东站", stopIndex: 0, time: "08:50", vehicle: "B04" },
  { route: "36路", stop: "中心医院", stopIndex: 1, time: "07:22", vehicle: "B01" },
  { route: "36路", stop: "中心医院", stopIndex: 1, time: "07:53", vehicle: "B02" },
  { route: "36路", stop: "中心医院", stopIndex: 1, time: "08:28", vehicle: "B03" },
  { route: "36路", stop: "中心医院", stopIndex: 1, time: "09:04", vehicle: "B04" },
  { route: "36路", stop: "文化宫",   stopIndex: 2, time: "07:35", vehicle: "B01" },
  { route: "36路", stop: "文化宫",   stopIndex: 2, time: "08:07", vehicle: "B02" },
  { route: "36路", stop: "文化宫",   stopIndex: 2, time: "08:41", vehicle: "B03" },
  { route: "36路", stop: "文化宫",   stopIndex: 2, time: "09:18", vehicle: "B04" },
  { route: "36路", stop: "滨江公园", stopIndex: 3, time: "07:50", vehicle: "B01" },
  { route: "36路", stop: "滨江公园", stopIndex: 3, time: "08:24", vehicle: "B02" },
  { route: "36路", stop: "滨江公园", stopIndex: 3, time: "08:58", vehicle: "B03" },
  { route: "36路", stop: "滨江公园", stopIndex: 3, time: "09:36", vehicle: "B04" },
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BUS_RECORDS };
}
