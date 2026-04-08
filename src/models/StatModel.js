class StatModel {
    constructor(data) {
        this.id = data.id || Date.now();
        this.name = data.name;
        this.cthQuaHan = data.cthQuaHan || 0;
        this.cthSapQuaHan = data.cthSapQuaHan || 0;
        this.cthTrongHan = data.cthTrongHan || 0;
        this.htQuaHan = data.htQuaHan || 0;
        this.htDangKy = data.htDangKy || 0;
        this.createdAt = data.createdAt || new Date();
    }

    getTotal() {
        return this.cthQuaHan + this.cthSapQuaHan + this.cthTrongHan +
            this.htQuaHan + this.htDangKy;
    }

    getStatusColor() {
        if (this.cthQuaHan > 0) return 'danger';
        if (this.cthSapQuaHan > 0) return 'warning';
        return 'success';
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            cthQuaHan: this.cthQuaHan,
            cthSapQuaHan: this.cthSapQuaHan,
            cthTrongHan: this.cthTrongHan,
            htQuaHan: this.htQuaHan,
            htDangKy: this.htDangKy,
            total: this.getTotal(),
            statusColor: this.getStatusColor()
        };
    }
}

export default StatModel;