package org.example.gitvisualization.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;

/**
 * 静态资源配置：把前端构建产物（frontend/dist）作为静态资源对外托管，
 * 使后端单端口（8080）即可直接访问中文前端界面。
 * <p>
 * Controller 映射（/warehouse、/git）优先级高于静态资源，二者互不冲突。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** 前端构建产物目录（相对项目根目录）。 */
    private static final String FRONTEND_DIST = "frontend/dist";

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // 根路径转发到 index.html（Spring Boot 的欢迎页机制只认 classpath 静态目录，
        // 自定义 file: 目录需要显式转发）
        registry.addViewController("/").setViewName("forward:/index.html");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        File dist = new File(FRONTEND_DIST).getAbsoluteFile();
        String location = dist.toURI().toString();
        if (!location.endsWith("/")) {
            location += "/";
        }
        registry.addResourceHandler("/**")
                .addResourceLocations(location)
                .setCachePeriod(0);
    }
}
