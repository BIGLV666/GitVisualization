package org.example.gitvisualization.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 提供 Jackson 2 的 ObjectMapper。
*/
@Configuration
public class Jackson2Config {

    @Bean
    public ObjectMapper jackson2ObjectMapper() {
        return new ObjectMapper();
    }
}
