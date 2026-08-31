package org.example.gitvisualization.controller;

import io.github.biglv666.webcommon.result.Result;
import lombok.RequiredArgsConstructor;
import org.example.gitvisualization.dto.WarehouseDto;
import org.example.gitvisualization.entity.Warehouse;
import org.example.gitvisualization.services.abstracts.WarehouseAbstract;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 仓库管理接口（增删改查）。
 * <p>
 * 统一返回 {@link Result}，业务异常由 web-common 的全局异常处理器统一转换为错误响应。
 */
@RestController
@RequestMapping("/warehouse")
@RequiredArgsConstructor
public class WarehouseController {

    private final WarehouseAbstract warehouseService;

    /**
     * 查询仓库列表。
     */
    @GetMapping
    public Result<List<Warehouse>> getWarehouses() {
        return Result.ok(warehouseService.getWarehouses());
    }

    /**
     * 新增（登记）仓库。
     *
     * @param dto 仓库信息（名称、本地路径、远程 URL）
     */
    @PostMapping
    public Result<Warehouse> createWarehouse(@RequestBody WarehouseDto dto) {
        return Result.ok(warehouseService.createWarehouse(dto));
    }

    /**
     * 更新仓库信息。
     *
     * @param id  仓库主键
     * @param dto 新的仓库信息
     */
    @PutMapping("/{id}")
    public Result<Warehouse> updateWarehouse(@PathVariable Long id, @RequestBody WarehouseDto dto) {
        return Result.ok(warehouseService.updateWarehouse(id, dto));
    }

    /**
     * 删除仓库（软删除）。
     *
     * @param id 仓库主键
     */
    @DeleteMapping("/{id}")
    public Result<Void> deleteWarehouse(@PathVariable Long id) {
        warehouseService.deleteWarehouse(id);
        return Result.ok();
    }
}
