package org.example.gitvisualization.services.abstracts;

import org.example.gitvisualization.dto.WarehouseDto;
import org.example.gitvisualization.entity.Warehouse;

import java.util.List;

/**
 * 仓库（Warehouse）增删改查契约。
 */
public interface WarehouseAbstract {

    /**
     * 查询仓库列表（不含已删除的仓库）。
     */
    List<Warehouse> getWarehouses();

    /**
     * 新增（登记）一个仓库。
     *
     * @param dto 仓库信息（名称、本地路径、远程 URL）
     * @return 已登记的仓库实体（含自增主键）
     */
    Warehouse createWarehouse(WarehouseDto dto);

    /**
     * 更新仓库信息。
     *
     * @param id  仓库主键
     * @param dto 新的仓库信息
     * @return 更新后的仓库实体
     */
    Warehouse updateWarehouse(Long id, WarehouseDto dto);

    /**
     * 删除仓库（软删除：标记为 DELETE 状态）。
     *
     * @param id 仓库主键
     */
    void deleteWarehouse(Long id);
}
